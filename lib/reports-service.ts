import type { Report } from "@prisma/client";
import { prisma } from "./prisma";
import { sanitizeText } from "./security";

export const VALID_REPORT_TYPES = [
  "waterlogging",
  "river_flood",
  "landslide",
  "road_block",
  "other",
] as const;

export const VALID_SEVERITIES = ["low", "medium", "high", "severe"] as const;
export const VALID_STATUSES = ["active", "resolved"] as const;

export type ReportType = (typeof VALID_REPORT_TYPES)[number];
export type ReportSeverity = (typeof VALID_SEVERITIES)[number];
export type ReportStatus = (typeof VALID_STATUSES)[number];

export interface PublicReportDTO {
  id: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  severity: ReportSeverity;
  imageUrl: string | null;
  status: ReportStatus;
  waterPresent: boolean;
  verified: boolean;
  demoMode: boolean;
  createdAt: string;
  updatedAt: string;
  // Legacy UI fields kept for seamless compatibility with existing MapView & Risk engine
  lat: number;
  lng: number;
  reason: string;
  photoUrl?: string;
  thumbnail?: string;
}

export function toPublicReport(row: Report): PublicReportDTO {
  const sev = VALID_SEVERITIES.includes(row.severity as ReportSeverity)
    ? (row.severity as ReportSeverity)
    : "medium";
  const status = VALID_STATUSES.includes(row.status as ReportStatus)
    ? (row.status as ReportStatus)
    : "active";

  const isDataUrl = Boolean(row.imageUrl?.startsWith("data:image/"));

  return {
    id: row.id,
    type: row.type,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    severity: sev,
    imageUrl: row.imageUrl ?? null,
    status,
    waterPresent: row.waterPresent,
    verified: row.verified,
    demoMode: row.demoMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lat: row.latitude,
    lng: row.longitude,
    reason: row.description,
    ...(row.imageUrl && !isDataUrl ? { photoUrl: row.imageUrl } : {}),
    ...(row.imageUrl && isDataUrl ? { thumbnail: row.imageUrl } : {}),
  };
}

export interface CreateReportInput {
  type?: unknown;
  category?: unknown;
  description?: unknown;
  reason?: unknown;
  latitude?: unknown;
  lat?: unknown;
  longitude?: unknown;
  lng?: unknown;
  severity?: unknown;
  imageUrl?: unknown;
  thumbnail?: unknown;
  photoKey?: unknown;
  waterPresent?: unknown;
  demoMode?: unknown;
}

export interface ValidationResult {
  ok: true;
  data: {
    type: ReportType;
    description: string;
    latitude: number;
    longitude: number;
    severity: ReportSeverity;
    imageUrl: string | null;
    waterPresent: boolean;
    verified: boolean;
    demoMode: boolean;
  };
}

export interface ValidationError {
  ok: false;
  error: string;
  status: number;
}

const MAX_IMAGE_DATA_URL_BYTES = 28_000;
const ALLOWED_IMAGE_DATA_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

export function validateCreateReport(
  body: CreateReportInput
): ValidationResult | ValidationError {
  const rawLat = body.latitude ?? body.lat;
  const rawLng = body.longitude ?? body.lng;

  if (
    typeof rawLat !== "number" ||
    typeof rawLng !== "number" ||
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng) ||
    rawLat < -90 ||
    rawLat > 90 ||
    rawLng < -180 ||
    rawLng > 180
  ) {
    return {
      ok: false,
      error: "Valid latitude (-90..90) and longitude (-180..180) are required.",
      status: 400,
    };
  }

  const rawType = String(body.type ?? body.category ?? "waterlogging")
    .trim()
    .toLowerCase();
  const type = VALID_REPORT_TYPES.includes(rawType as ReportType)
    ? (rawType as ReportType)
    : null;
  if (!type) {
    return {
      ok: false,
      error: `Invalid report type. Allowed: ${VALID_REPORT_TYPES.join(", ")}.`,
      status: 400,
    };
  }

  const rawDesc = body.description ?? body.reason;
  if (typeof rawDesc !== "string" || !sanitizeText(rawDesc, 500)) {
    return {
      ok: false,
      error: "Description is required (max 500 characters).",
      status: 400,
    };
  }
  const description = sanitizeText(rawDesc, 500);

  const rawSeverity = String(body.severity ?? "medium")
    .trim()
    .toLowerCase();
  const severity = VALID_SEVERITIES.includes(rawSeverity as ReportSeverity)
    ? (rawSeverity as ReportSeverity)
    : null;
  if (!severity) {
    return {
      ok: false,
      error: `Invalid severity. Allowed: ${VALID_SEVERITIES.join(", ")}.`,
      status: 400,
    };
  }

  let imageUrl: string | null = null;
  const rawImg = body.imageUrl ?? body.thumbnail ?? body.photoKey;
  if (rawImg !== undefined && rawImg !== null && rawImg !== "") {
    if (typeof rawImg !== "string") {
      return { ok: false, error: "Invalid imageUrl.", status: 400 };
    }
    const trimmedImg = rawImg.trim();
    if (trimmedImg.startsWith("data:")) {
      const allowed = ALLOWED_IMAGE_DATA_PREFIXES.some((p) =>
        trimmedImg.toLowerCase().startsWith(p)
      );
      if (!allowed) {
        return {
          ok: false,
          error: "Unsupported image format. Use JPEG, PNG, or WebP.",
          status: 400,
        };
      }
      if (trimmedImg.length > MAX_IMAGE_DATA_URL_BYTES) {
        return {
          ok: false,
          error: "Inline image exceeds size limit (28KB).",
          status: 413,
        };
      }
      imageUrl = trimmedImg;
    } else if (
      trimmedImg.startsWith("https://") ||
      trimmedImg.startsWith("http://") ||
      trimmedImg.startsWith("reports/")
    ) {
      imageUrl = trimmedImg.slice(0, 500);
    } else {
      return {
        ok: false,
        error: "imageUrl must be an http(s) URL, S3 key, or base64 image.",
        status: 400,
      };
    }
  }

  const waterPresent =
    body.waterPresent === undefined ? true : Boolean(body.waterPresent);

  return {
    ok: true,
    data: {
      type,
      description,
      latitude: rawLat,
      longitude: rawLng,
      severity,
      imageUrl,
      waterPresent,
      verified: waterPresent,
      demoMode: Boolean(body.demoMode),
    },
  };
}

export interface ReportFilterParams {
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
}

export async function listReports(params: ReportFilterParams = {}) {
  const limit = Math.min(Math.max(1, params.limit ?? 50), 100);
  const offset = Math.max(0, params.offset ?? 0);

  const where: Record<string, unknown> = {};
  if (params.type && VALID_REPORT_TYPES.includes(params.type as ReportType)) {
    where.type = params.type;
  }
  if (params.status && VALID_STATUSES.includes(params.status as ReportStatus)) {
    where.status = params.status;
  }
  if (
    typeof params.minLat === "number" &&
    typeof params.maxLat === "number" &&
    Number.isFinite(params.minLat) &&
    Number.isFinite(params.maxLat)
  ) {
    where.latitude = { gte: params.minLat, lte: params.maxLat };
  }
  if (
    typeof params.minLng === "number" &&
    typeof params.maxLng === "number" &&
    Number.isFinite(params.minLng) &&
    Number.isFinite(params.maxLng)
  ) {
    where.longitude = { gte: params.minLng, lte: params.maxLng };
  }

  const [rows, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.report.count({ where }),
  ]);

  return {
    reports: rows.map(toPublicReport),
    total,
    limit,
    offset,
  };
}
