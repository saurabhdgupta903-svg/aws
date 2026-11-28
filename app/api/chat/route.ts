import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited, sanitizeText } from "@/lib/security";
import { generateSafetyReply, type ChatTurn } from "@/lib/llm";
import type { Lang } from "@/lib/i18n";

const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY_TURNS = 6;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`chat:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a few minutes before sending more messages." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as {
      message?: unknown;
      history?: unknown;
      riskLevel?: unknown;
      language?: unknown;
    };

    if (typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const trimmed = body.message.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { error: `Message exceeds ${MAX_MESSAGE_LEN} character limit.` },
        { status: 400 }
      );
    }

    const cleanMessage = sanitizeText(trimmed, MAX_MESSAGE_LEN);
    if (!cleanMessage) {
      return NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 }
      );
    }

    const history: ChatTurn[] = [];
    if (Array.isArray(body.history)) {
      for (const item of body.history.slice(-MAX_HISTORY_TURNS)) {
        if (
          item &&
          typeof item === "object" &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string"
        ) {
          const cleanContent = sanitizeText(item.content, MAX_MESSAGE_LEN);
          if (cleanContent) {
            history.push({ role: item.role, content: cleanContent });
          }
        }
      }
    }

    const rawLang = typeof body.language === "string" ? body.language.trim().toLowerCase() : "en";
    const language: Lang = rawLang === "mr" ? "mr" : rawLang === "hi" ? "hi" : "en";

    const riskLevel =
      typeof body.riskLevel === "string" &&
      ["low", "medium", "high", "severe"].includes(body.riskLevel.toLowerCase())
        ? body.riskLevel.toLowerCase()
        : undefined;

    const result = await generateSafetyReply({
      message: cleanMessage,
      history,
      riskLevel,
      language,
    });

    return NextResponse.json({
      reply: result.reply,
      suggestEmergency: result.suggestEmergency,
      ...(result.fallback ? { fallback: true } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid chat request." },
      { status: 400 }
    );
  }
}
