import type { NextRequest } from "next/server";

const rateLimitStore = new Map<string, number[]>();

/**
 * Sliding-window per-IP rate limiter.
 * Returns true if the caller has exceeded `maxRequests` within `windowMs`.
 */
export function isRateLimited(
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = (rateLimitStore.get(bucketKey) ?? []).filter(
    (t) => now - t < windowMs
  );
  if (timestamps.length >= maxRequests) {
    rateLimitStore.set(bucketKey, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitStore.set(bucketKey, timestamps);
  return false;
}

export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

/**
 * Strip HTML tags and dangerous characters so user-supplied text
 * cannot inject HTML or script into responses or UI.
 */
export function sanitizeText(input: string, maxLen = 500): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}
