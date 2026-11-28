import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/security";
import {
  listReports,
  toPublicReport,
  validateCreateReport,
  type CreateReportInput,
  type PublicReportDTO,
} from "@/lib/reports-service";
import { notifySubscribersForReport } from "@/lib/alerts-service";

const MAX_REQUEST_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function attachPresignedUrls(
  reports: PublicReportDTO[]
): Promise<PublicReportDTO[]> {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) return reports;
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const s3 = new S3Client({ region });
  return Promise.all(
    reports.map(async (rep) => {
      if (!rep.imageUrl || !rep.imageUrl.startsWith("reports/")) return rep;
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: rep.imageUrl }),
          { expiresIn: 900 }
        );
        return { ...rep, photoUrl: url };
      } catch {
        return rep;
      }
    })
  );
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const parseNum = (val: string | null): number | undefined => {
      if (val === null || val === "") return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    };

    const result = await listReports({
      limit: parseNum(sp.get("limit")),
      offset: parseNum(sp.get("offset")),
      type: sp.get("type")?.trim() || undefined,
      status: sp.get("status")?.trim() || undefined,
      minLat: parseNum(sp.get("minLat")),
      maxLat: parseNum(sp.get("maxLat")),
      minLng: parseNum(sp.get("minLng")),
      maxLng: parseNum(sp.get("maxLng")),
    });

    const reports = await attachPresignedUrls(result.reports);
    return NextResponse.json({
      reports,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (err) {
    console.error("[GET /api/reports] Database error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Unable to load reports right now." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`reports:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many reports submitted. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Request payload exceeds 64KB limit." },
        { status: 413 }
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Request payload exceeds 64KB limit." },
        { status: 413 }
      );
    }

    let body: CreateReportInput;
    try {
      body = JSON.parse(rawText) as CreateReportInput;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const validation = validateCreateReport(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const created = await prisma.report.create({
      data: {
        type: validation.data.type,
        description: validation.data.description,
        latitude: validation.data.latitude,
        longitude: validation.data.longitude,
        severity: validation.data.severity,
        imageUrl: validation.data.imageUrl,
        waterPresent: validation.data.waterPresent,
        verified: validation.data.verified,
        demoMode: validation.data.demoMode,
        status: "active",
      },
    });

    const reportDto = toPublicReport(created);
    // Fire-and-forget async email alerts so POST /api/reports never slows down or fails
    void notifySubscribersForReport(reportDto).catch((err) => {
      console.error("[POST /api/reports] Async alert error:", err instanceof Error ? err.message : "unknown");
    });

    const listResult = await listReports({ limit: 50, offset: 0 });
    const reports = await attachPresignedUrls(listResult.reports);

    return NextResponse.json(
      { report: reportDto, reports },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/reports] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Failed to save report." },
      { status: 500 }
    );
  }
}
