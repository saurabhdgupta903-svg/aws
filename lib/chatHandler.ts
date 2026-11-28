import { NextRequest, NextResponse } from "next/server";
import type { Lang } from "./i18n";
import {
  generateChatReply,
  LlmError,
  type ChatMessage,
  type LlmGenerator,
} from "./llm_client";
import {
  buildPrecautionSystemPrompt,
  enforceEmergencyRule,
  getEmergencyFirstLine,
  isEmergencyMessage,
  type PrecautionChatContext,
} from "./precautionPrompt";
import {
  applyCorsHeaders,
  checkRateLimit,
  getClientIp,
  sanitizeText,
} from "./reportSecurity";
import type { RiskLevel } from "./risk";

export const MAX_CHAT_MESSAGE_LEN = 500;
export const MAX_CHAT_HISTORY = 6;
export const MAX_HISTORY_ITEM_LEN = 1000;
export const CHAT_TIMEOUT_MS = 15_000;

const VALID_RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "severe"];
const VALID_LANGS: Lang[] = ["en", "mr", "hi"];

export function getChatFallbackReply(lang?: Lang): string {
  if (lang === "mr") {
    return "सध्या सुरक्षा सहाय्यक उपलब्ध नाही. कृपया वरील 'काय करावे / काय करू नये' सूचना पहा. कोणतीही आपत्कालीन स्थिती असल्यास तात्काळ 112 वर कॉल करा.";
  }
  if (lang === "hi") {
    return "सुरक्षा सहायक अभी उपलब्ध नहीं है। कृपया ऊपर दिए गए 'क्या करें / क्या न करें' निर्देश देखें। किसी भी आपातकालीन स्थिति में तुरंत 112 पर कॉल करें।";
  }
  return "The safety assistant is temporarily unavailable. Please review the Do's & Don'ts above, and in any emergency call 112 immediately.";
}

function parseContext(raw: unknown): PrecautionChatContext | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const topic = sanitizeText(raw, 120);
    return topic ? { topic } : undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const obj = raw as Record<string, unknown>;
  const ctx: PrecautionChatContext = {};

  if (
    typeof obj.riskLevel === "string" &&
    VALID_RISK_LEVELS.includes(obj.riskLevel as RiskLevel)
  ) {
    ctx.riskLevel = obj.riskLevel as RiskLevel;
  }
  if (typeof obj.lang === "string" && VALID_LANGS.includes(obj.lang as Lang)) {
    ctx.lang = obj.lang as Lang;
  }
  if (typeof obj.city === "string") {
    const city = sanitizeText(obj.city, 80);
    if (city) ctx.city = city;
  }
  if (typeof obj.topic === "string") {
    const topic = sanitizeText(obj.topic, 120);
    if (topic) ctx.topic = topic;
  }

  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: ChatMessage[] = [];

  for (const item of raw.slice(-MAX_CHAT_HISTORY)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.role !== "user" && rec.role !== "assistant") continue;
    if (typeof rec.content !== "string") continue;
    const content = sanitizeText(rec.content, MAX_HISTORY_ITEM_LEN);
    if (!content) continue;
    cleaned.push({ role: rec.role, content });
  }

  return cleaned;
}

export async function handleChatRequest(
  req: NextRequest,
  llmGenerator: LlmGenerator = generateChatReply
): Promise<NextResponse> {
  const ip = getClientIp(req);
  const maxReq = Number(process.env.CHAT_RATE_LIMIT_MAX) || 15;
  const windowMs = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS) || 60_000;
  const rate = checkRateLimit(`chat:${ip}`, maxReq, windowMs);

  if (!rate.allowed) {
    const res = NextResponse.json(
      {
        error: "Too many messages. Please wait a moment before asking again.",
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(rate.retryAfterSec));
    return applyCorsHeaders(req, res);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return applyCorsHeaders(
        req,
        NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    );
  }

  if (typeof body.message !== "string") {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Message is required and must be a string." },
        { status: 400 }
      )
    );
  }

  const rawTrimmed = body.message.trim();
  if (!rawTrimmed) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 }
      )
    );
  }

  if (rawTrimmed.length > MAX_CHAT_MESSAGE_LEN) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        {
          error: `Message exceeds ${MAX_CHAT_MESSAGE_LEN} character limit.`,
        },
        { status: 400 }
      )
    );
  }

  const message = sanitizeText(rawTrimmed, MAX_CHAT_MESSAGE_LEN);
  if (!message) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 }
      )
    );
  }

  const history = parseHistory(body.history);
  const context = parseContext(body.context);
  const systemPrompt = buildPrecautionSystemPrompt(context);
  const emergencyDetected = isEmergencyMessage(message);

  try {
    const rawReply = await llmGenerator({
      systemPrompt,
      messages: [...history, { role: "user", content: message }],
      timeoutMs: CHAT_TIMEOUT_MS,
    });

    const reply = enforceEmergencyRule(message, rawReply, context?.lang);
    return applyCorsHeaders(
      req,
      NextResponse.json({ reply, emergency: emergencyDetected })
    );
  } catch (err) {
    const code = err instanceof LlmError ? err.code : "PROVIDER";
    console.error(`[chat] provider failure: ${code}`);

    const fallbackBase = getChatFallbackReply(context?.lang);
    const fallbackReply = emergencyDetected
      ? `${getEmergencyFirstLine(context?.lang)}\n\n${fallbackBase}`
      : fallbackBase;

    const status =
      code === "TIMEOUT" ? 504 : code === "RATE_LIMIT" ? 429 : 503;

    return applyCorsHeaders(
      req,
      NextResponse.json(
        {
          error:
            code === "TIMEOUT"
              ? "The safety assistant timed out. Please try again."
              : code === "RATE_LIMIT"
                ? "Assistant capacity is busy. Please try again shortly."
                : "Safety assistant is temporarily unavailable.",
          reply: fallbackReply,
          fallback: true,
        },
        { status }
      )
    );
  }
}
