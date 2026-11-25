import { NextRequest, NextResponse } from "next/server";
import { recomputeVerifications, type FloodReport } from "@/lib/store";

const REDIS_KEY = "floodloop:maharashtra:reports:v1";
const MAX_REPORTS = 200;
const TTL_MS = 24 * 60 * 60 * 1000;

declare global {
  var __floodloopReports: FloodReport[] | undefined;
}

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) return { url, token };
  return null;
}

function pruneAndVerify(reports: FloodReport[]): FloodReport[] {
  const cutoff = Date.now() - TTL_MS;
  const fresh = reports
    .filter((r) => new Date(r.createdAt).getTime() >= cutoff)
    .slice(0, MAX_REPORTS);
  return recomputeVerifications(fresh);
}

async function readReports(): Promise<FloodReport[]> {
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/${REDIS_KEY}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string | null };
        if (json.result) {
          const parsed = JSON.parse(json.result) as FloodReport[];
          return pruneAndVerify(parsed);
        }
        return [];
      }
    } catch {
      // Fallback to in-memory on Redis transient error
    }
  }
  const mem = globalThis.__floodloopReports ?? [];
  const pruned = pruneAndVerify(mem);
  globalThis.__floodloopReports = pruned;
  return pruned;
}

async function writeReports(reports: FloodReport[]): Promise<FloodReport[]> {
  const pruned = pruneAndVerify(reports);
  globalThis.__floodloopReports = pruned;

  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/${REDIS_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redis.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(pruned)),
      });
    } catch {
      // Keep in-memory copy
    }
  }
  return pruned;
}

export async function GET() {
  const reports = await readReports();
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<FloodReport>;
    if (
      typeof body.lat !== "number" ||
      typeof body.lng !== "number" ||
      Number.isNaN(body.lat) ||
      Number.isNaN(body.lng)
    ) {
      return NextResponse.json(
        { error: "Invalid lat/lng coordinates." },
        { status: 400 }
      );
    }

    const validSeverities = ["low", "medium", "high", "severe"];
    const severity = validSeverities.includes(String(body.severity))
      ? (body.severity as FloodReport["severity"])
      : "medium";

    const thumbnail =
      typeof body.thumbnail === "string" && body.thumbnail.length <= 28000
        ? body.thumbnail
        : "";

    const newReport: FloodReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      lat: body.lat,
      lng: body.lng,
      thumbnail,
      waterPresent: Boolean(body.waterPresent),
      severity,
      reason:
        typeof body.reason === "string"
          ? body.reason.slice(0, 240)
          : "User submitted flood report.",
      verified: Boolean(body.waterPresent),
      demoMode: Boolean(body.demoMode),
      createdAt: new Date().toISOString(),
    };

    const existing = await readReports();
    const updated = await writeReports([newReport, ...existing]);
    return NextResponse.json({ report: newReport, reports: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to save report." },
      { status: 400 }
    );
  }
}
