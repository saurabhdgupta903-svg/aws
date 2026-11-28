import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import {
  handleChatRequest,
  MAX_CHAT_HISTORY,
  MAX_CHAT_MESSAGE_LEN,
} from "../lib/chatHandler";
import { LlmError, type LlmGenerator } from "../lib/llm_client";
import { buildPrecautionSystemPrompt } from "../lib/precautionPrompt";
import { resetRateLimitStore } from "../lib/reportSecurity";

function makeChatPost(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.25",
      ...headers,
    },
    body: payload,
  });
}

describe("Precaution Chat API (/api/chat)", () => {
  beforeEach(() => {
    resetRateLimitStore();
    delete process.env.CHAT_RATE_LIMIT_MAX;
    delete process.env.CHAT_RATE_LIMIT_WINDOW_MS;
  });

  it("rejects empty, invalid, and over-limit messages", async () => {
    const mockLlm: LlmGenerator = async () => "ok";

    const emptyRes = await handleChatRequest(
      makeChatPost({ message: "   " }),
      mockLlm
    );
    assert.equal(emptyRes.status, 400);

    const nonStringRes = await handleChatRequest(
      makeChatPost({ message: 12345 }),
      mockLlm
    );
    assert.equal(nonStringRes.status, 400);

    const tooLongRes = await handleChatRequest(
      makeChatPost({ message: "a".repeat(MAX_CHAT_MESSAGE_LEN + 1) }),
      mockLlm
    );
    assert.equal(tooLongRes.status, 400);

    const badJsonRes = await handleChatRequest(
      makeChatPost("{not-json"),
      mockLlm
    );
    assert.equal(badJsonRes.status, 400);
  });

  it("caps conversation history to the last 6 messages and grounds system prompt", async () => {
    let capturedSystemPrompt = "";
    let capturedMessageCount = 0;

    const mockLlm: LlmGenerator = async (opts) => {
      capturedSystemPrompt = opts.systemPrompt;
      capturedMessageCount = opts.messages.length;
      return "Move to higher ground and avoid subways.";
    };

    const history = Array.from({ length: 10 }, (_, idx) => ({
      role: idx % 2 === 0 ? "user" : "assistant",
      content: `turn ${idx}`,
    }));

    const res = await handleChatRequest(
      makeChatPost({
        message: "What should I do during high flood risk?",
        history,
        context: { riskLevel: "high", city: "Mumbai", lang: "en" },
      }),
      mockLlm
    );

    assert.equal(res.status, 200);
    const data = (await res.json()) as { reply: string };
    assert.ok(data.reply.includes("higher ground"));
    assert.equal(capturedMessageCount, MAX_CHAT_HISTORY + 1);
    assert.ok(capturedSystemPrompt.includes("FLOODLOOP AI PRECAUTION CONTENT"));
    assert.ok(capturedSystemPrompt.includes("112"));
    assert.ok(capturedSystemPrompt.includes("Mumbai"));
  });

  it("enforces per-IP rate limiting with 429", async () => {
    process.env.CHAT_RATE_LIMIT_MAX = "2";
    process.env.CHAT_RATE_LIMIT_WINDOW_MS = "60000";
    const mockLlm: LlmGenerator = async () => "Stay safe.";

    const r1 = await handleChatRequest(
      makeChatPost({ message: "Question 1" }),
      mockLlm
    );
    const r2 = await handleChatRequest(
      makeChatPost({ message: "Question 2" }),
      mockLlm
    );
    const r3 = await handleChatRequest(
      makeChatPost({ message: "Question 3" }),
      mockLlm
    );

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.ok(r3.headers.get("retry-after"));
  });

  it("puts emergency number 112 first for life-threatening emergencies", async () => {
    const prompt = buildPrecautionSystemPrompt({ lang: "en" });
    assert.ok(prompt.includes("VERY FIRST LINE"));
    assert.ok(prompt.includes("112"));

    // Simulate an LLM response that forgot to put 112 on the first line
    const mockLlm: LlmGenerator = async () =>
      "Evacuate the building immediately and stay low away from smoke.";

    const res = await handleChatRequest(
      makeChatPost({
        message: "my house is on fire",
        context: { lang: "en" },
      }),
      mockLlm
    );

    assert.equal(res.status, 200);
    const data = (await res.json()) as { reply: string; emergency?: boolean };
    assert.equal(data.emergency, true);
    const firstLine = data.reply.split(/\r?\n/)[0] ?? "";
    assert.ok(firstLine.includes("112"), `Expected 112 in first line, got: ${firstLine}`);
  });

  it("returns a friendly fallback when the LLM provider fails or times out", async () => {
    const failingLlm: LlmGenerator = async () => {
      throw new LlmError("PROVIDER", "Upstream error");
    };

    const failRes = await handleChatRequest(
      makeChatPost({ message: "What goes in an emergency kit?" }),
      failingLlm
    );
    assert.equal(failRes.status, 503);
    const failData = (await failRes.json()) as {
      reply: string;
      fallback: boolean;
    };
    assert.equal(failData.fallback, true);
    assert.ok(failData.reply.includes("112"));

    const timeoutLlm: LlmGenerator = async () => {
      throw new LlmError("TIMEOUT", "Timed out");
    };
    const timeoutRes = await handleChatRequest(
      makeChatPost({ message: "How to stay safe in ghat areas?" }),
      timeoutLlm
    );
    assert.equal(timeoutRes.status, 504);
  });
});
