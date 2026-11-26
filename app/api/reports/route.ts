import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { recomputeVerifications, type FloodReport } from "@/lib/store";

const MAX_REPORTS = 200;
const TTL_SECONDS = 24 * 60 * 60; // 24 hours
const TTL_MS = TTL_SECONDS * 1000;

declare global {
  var __floodloopReports: FloodReport[] | undefined;
}

function getAwsConfig() {
  const table = process.env.DDB_TABLE?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  return { table, bucket, region };
}

function pruneMemory(reports: FloodReport[]): FloodReport[] {
  const cutoff = Date.now() - TTL_MS;
  const fresh = reports
    .filter((r) => new Date(r.createdAt).getTime() >= cutoff)
    .slice(0, MAX_REPORTS);
  return recomputeVerifications(fresh);
}

async function attachPresignedUrls(
  reports: FloodReport[],
  bucket?: string,
  region?: string
): Promise<FloodReport[]> {
  if (!bucket) return reports;
  const s3 = new S3Client({ region: region || "ap-south-1" });
  return Promise.all(
    reports.map(async (rep) => {
      if (!rep.photoKey) return rep;
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: rep.photoKey }),
          { expiresIn: 900 }
        );
        return { ...rep, photoUrl: url };
      } catch {
        return rep;
      }
    })
  );
}

async function readReports(): Promise<FloodReport[]> {
  const { table, bucket, region } = getAwsConfig();

  if (table) {
    try {
      const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
      const nowSec = Math.floor(Date.now() / 1000);
      const res = await ddb.send(
        new ScanCommand({
          TableName: table,
          Limit: MAX_REPORTS,
        })
      );

      const items = ((res.Items ?? []) as Array<FloodReport & { expiresAt?: number }>)
        .filter((item) => !item.expiresAt || item.expiresAt > nowSec)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, MAX_REPORTS);

      const verified = recomputeVerifications(items);
      return attachPresignedUrls(verified, bucket, region);
    } catch {
      // Fall back to in-memory store if DynamoDB is unreachable locally
    }
  }

  const mem = globalThis.__floodloopReports ?? [];
  const pruned = pruneMemory(mem);
  globalThis.__floodloopReports = pruned;
  return attachPresignedUrls(pruned, bucket, region);
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

    const photoKey =
      typeof body.photoKey === "string" && body.photoKey.startsWith("reports/")
        ? body.photoKey.slice(0, 180)
        : undefined;

    // Only store thumbnail in memory fallback if S3 photoKey is absent
    const thumbnail =
      !photoKey &&
      typeof body.thumbnail === "string" &&
      body.thumbnail.length <= 28000
        ? body.thumbnail
        : undefined;

    const nowMs = Date.now();
    const expiresAt = Math.floor(nowMs / 1000) + TTL_SECONDS;

    const newReport: FloodReport = {
      id: `rep-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      lat: body.lat,
      lng: body.lng,
      photoKey,
      thumbnail,
      waterPresent: Boolean(body.waterPresent),
      severity,
      reason:
        typeof body.reason === "string"
          ? body.reason.slice(0, 240)
          : "User submitted flood report.",
      verified: Boolean(body.waterPresent),
      demoMode: Boolean(body.demoMode),
      createdAt: new Date(nowMs).toISOString(),
    };

    const { table, region } = getAwsConfig();
    let savedToDdb = false;

    if (table) {
      try {
        const ddb = DynamoDBDocumentClient.from(
          new DynamoDBClient({ region })
        );
        // Store only photoKey (never raw base64 thumbnail) in DynamoDB
        const item: Record<string, unknown> = {
          id: newReport.id,
          lat: newReport.lat,
          lng: newReport.lng,
          severity: newReport.severity,
          waterPresent: newReport.waterPresent,
          verified: newReport.verified,
          reason: newReport.reason,
          demoMode: newReport.demoMode,
          createdAt: newReport.createdAt,
          expiresAt,
        };
        if (newReport.photoKey) item.photoKey = newReport.photoKey;

        await ddb.send(
          new PutCommand({
            TableName: table,
            Item: item,
          })
        );
        savedToDdb = true;
      } catch {
        // Fall back to in-memory
      }
    }

    if (!savedToDdb) {
      const mem = globalThis.__floodloopReports ?? [];
      globalThis.__floodloopReports = pruneMemory([newReport, ...mem]);
    }

    const updated = await readReports();
    return NextResponse.json({ report: newReport, reports: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to save report." },
      { status: 400 }
    );
  }
}
