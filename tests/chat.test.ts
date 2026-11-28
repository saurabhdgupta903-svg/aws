import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimitStore } from "@/lib/security";
import { POST as chatPost } from "@/app/api/chat/route";

describe("Feature 4: AI Safety Chatbot (/api/chat)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearRateLimitStore();
    process.env = {
      ...originalEnv,
      LLM_PROVIDER: "gemini",
      LLM_API_KEY: "AIzaSyMockSecretKeyForTest12345",
      LLM_MODEL: "gemini-2.5-flash",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validates empty and >500-char messages", async () => {
    const emptyRes = await chatPost(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.1" },
        body: JSON.stringify({ message: "   ", language: "en" }),
      })
    );
    expect(emptyRes.status).toBe(400);

    const longRes = await chatPost(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.1" },
        body: JSON.stringify({ message: "a".repeat(501), language: "en" }),
      })
    );
    expect(longRes.status).toBe(400);
  });

  it("enforces per-IP rate limiting (429)", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "models/gemini-2.5-flash" }],
          candidates: [{ content: { parts: [{ text: "Stay on higher ground." }] } }],
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    for (let i = 0; i < 20; i++) {
      const res = await chatPost(
        new NextRequest("http://localhost:3000/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" },
          body: JSON.stringify({ message: "Flood kit?", language: "en" }),
        })
      );
      expect(res.status).toBe(200);
    }

    const limitedRes = await chatPost(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" },
        body: JSON.stringify({ message: "One more", language: "en" }),
      })
    );
    expect(limitedRes.status).toBe(429);
  });

  it("returns 112-first guidance and suggestEmergency=true with mocked LLM", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/models?")) {
        return new Response(
          JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "Call 112 immediately for rescue.\n- Move to an upper floor.\n- Avoid wet switches.",
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const res = await chatPost(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.3" },
        body: JSON.stringify({
          message: "Water is entering my house right now!",
          history: [],
          riskLevel: "severe",
          language: "en",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply.startsWith("Call 112")).toBe(true);
    expect(json.suggestEmergency).toBe(true);
    expect(JSON.stringify(json)).not.toContain("AIzaSyMockSecretKeyForTest12345");
  });

  it("returns friendly fallback per error category and never leaks API key", async () => {
    const errorStatuses = [401, 404, 429, 400];
    for (const status of errorStatuses) {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("/models?")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ error: { message: `Simulated ${status} error` } }),
          { status }
        );
      }) as typeof fetch;

      const res = await chatPost(
        new NextRequest("http://localhost:3000/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `2.2.3.${status}`,
          },
          body: JSON.stringify({ message: "Help", language: "en" }),
        })
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("AIzaSyMockSecretKeyForTest12345");
      const json = JSON.parse(text);
      expect(json.fallback).toBe(true);
      expect(json.reply).toContain("112");
    }
  });
});
