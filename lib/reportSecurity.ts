import { NextRequest, NextResponse } from "next/server";

export const ALLOWED_REPORT_TYPES = [
  "flood",
  "waterlogging",
  "drain_overflow",
  "landslide",
  "road_block",
  "other",
] as const;

export const ALLOWED_SEVERITIES = ["low", "medium", "high", "severe"] as const;
export const ALLOWED_STATUSES = ["active", "resolved"] as const;

export type ReportType = (typeof ALLOWED_REPORT_TYPES)[number];
export type ReportSeverity = (typeof ALLOWED_SEVERITIES)[number];
export type ReportStatus = (typeof ALLOWED_STATUSES)[number];

export const MAX_BODY_BYTES = 100 * 1024; // 100 KB max JSON payload for POST /api/reports
export const MAX_TITLE_LEN = 120;
export const MAX_DESCRIPTION_LEN = 500;
export const MAX_IMAGE_URL_LEN = 500;
export const MAX_DATA_URL_BYTES = 35 * 1024; // ~35 KB for compressed thumbnail data URL

const ALLOWED_DATA_URL_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

/**
 * Strip HTML tags, script/style blocks, and control characters to prevent XSS.
 */
export function sanitizeText(input: string, maxLength: number): string {
  const withoutScripts = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutScripts.slice(0, maxLength);
}

/**
 * Validate an optional image URL or compressed image data URL.
 */
export function validateImageInput(raw: unknown): {
  valid: boolean;
  value?: string;
  error?: string;
} {
  if (raw === undefined || raw === null || raw === "") {
    return { valid: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return { valid: false, error: "Image URL must be a string." };
  }

  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, value: undefined };

  if (trimmed.startsWith("data:")) {
    const lower = trimmed.toLowerCase();
    const hasAllowedPrefix = ALLOWED_DATA_URL_PREFIXES.some((p) =>
      lower.startsWith(p)
    );
    if (!hasAllowedPrefix) {
      return {
        valid: false,
        error: "Unsupported image type. Allowed: image/jpeg, image/png, image/webp.",
      };
    }
    if (Buffer.byteLength(trimmed, "utf8") > MAX_DATA_URL_BYTES) {
      return {
        valid: false,
        error: "Image thumbnail exceeds maximum allowed size (35 KB).",
      };
    }
    return { valid: true, value: trimmed };
  }

  if (trimmed.length > MAX_IMAGE_URL_LEN) {
    return {
      valid: false,
      error: `Image URL must be at most ${MAX_IMAGE_URL_LEN} characters.`,
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "Image URL must use http or https." };
    }
    return { valid: true, value: trimmed };
  } catch {
    return { valid: false, error: "Invalid image URL format." };
  }
}

// ── Simple in-memory per-IP sliding window rate limiter ──────────────────────

interface RateBucket {
  timestamps: number[];
}

declare global {
  var __floodloopRateLimit: Map<string, RateBucket> | undefined;
}

function getRateStore(): Map<string, RateBucket> {
  if (!globalThis.__floodloopRateLimit) {
    globalThis.__floodloopRateLimit = new Map();
  }
  return globalThis.__floodloopRateLimit;
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export function checkRateLimit(
  ip: string,
  maxRequests = Number(process.env.RATE_LIMIT_MAX) || 20,
  windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
): { allowed: boolean; retryAfterSec: number } {
  const store = getRateStore();
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = store.get(ip) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(ip, bucket);
    return { allowed: false, retryAfterSec };
  }

  bucket.timestamps.push(now);
  store.set(ip, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimitStore(): void {
  globalThis.__floodloopRateLimit?.clear();
}

// ── CORS helpers ────────────────────────────────────────────────────────────

export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return ["http://localhost:3000"];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function applyCorsHeaders(
  req: NextRequest,
  res: NextResponse
): NextResponse {
  const origin = req.headers.get("origin");
  if (!origin) return res;

  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.append("Vary", "Origin");
  }
  return res;
}

export function handleCorsPreflight(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigins();

  if (origin && !allowed.includes(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed by CORS policy." },
      { status: 403 }
    );
  }

  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, res);
}
