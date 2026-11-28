import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma, Report } from "@prisma/client";
import { prisma } from "./db";
import { haversineMeters } from "./geo";
import {
  ALLOWED_REPORT_TYPES,
  ALLOWED_SEVERITIES,
  ALLOWED_STATUSES,
  MAX_DESCRIPTION_LEN,
  MAX_TITLE_LEN,
  sanitizeText,
  validateImageInput,
  type ReportSeverity,
  type ReportStatus,
  type ReportType,
} from "./reportSecurity";

export interface SerializedReport {
  id: string;
  title: string | null;
  type: ReportType | string;
  description: string;
  reason: string;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  severity: ReportSeverity;
  imageUrl: string | null;
  photoKey?: string;
  photoUrl?: string;
  thumbnail?: string;
  status: ReportStatus;
  waterPresent: boolean;
  verified: boolean;
  demoMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListReportsParams {
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface ListReportsResult {
  reports: SerializedReport[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CreateReportInput {
  title?: unknown;
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
  image_url?: unknown;
  thumbnail?: unknown;
  photoKey?: unknown;
  status?: unknown;
  waterPresent?: unknown;
  demoMode?: unknown;
}

export class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function serializeReport(row: Report): SerializedReport {
  const isDataThumb = row.imageUrl?.startsWith("data:") ?? false;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    reason: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    lat: row.latitude,
    lng: row.longitude,
    severity: (ALLOWED_SEVERITIES.includes(row.severity as ReportSeverity)
      ? row.severity
      : "medium") as ReportSeverity,
    imageUrl: row.imageUrl,
    photoKey: row.photoKey ?? undefined,
    photoUrl: !isDataThumb && row.imageUrl ? row.imageUrl : undefined,
    thumbnail: isDataThumb && row.imageUrl ? row.imageUrl : undefined,
    status: (ALLOWED_STATUSES.includes(row.status as ReportStatus)
      ? row.status
      : "active") as ReportStatus,
    waterPresent: row.waterPresent,
    verified: row.verified,
    demoMode: row.demoMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function attachPresignedUrls(
  reports: SerializedReport[]
): Promise<SerializedReport[]> {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) return reports;
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const s3 = new S3Client({ region });

  return Promise.all(
    reports.map(async (rep) => {
      if (!rep.photoKey) return rep;
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: rep.photoKey }),
          { expiresIn: 900 }
        );
        return { ...rep, photoUrl: url, imageUrl: rep.imageUrl ?? url };
      } catch {
        return rep;
      }
    })
  );
}

export function validateCreateReportPayload(
  body: CreateReportInput
): {
  title: string | null;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  severity: ReportSeverity;
  imageUrl: string | null;
  photoKey: string | null;
  status: ReportStatus;
  waterPresent: boolean;
  demoMode: boolean;
} {
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
    throw new ValidationError(
      "Invalid coordinates. 'latitude' (-90..90) and 'longitude' (-180..180) are required."
    );
  }

  const rawDesc = body.description ?? body.reason;
  if (typeof rawDesc !== "string" || !rawDesc.trim()) {
    throw new ValidationError("A non-empty 'description' is required.");
  }
  const description = sanitizeText(rawDesc, MAX_DESCRIPTION_LEN);
  if (!description) {
    throw new ValidationError("Description cannot be empty after sanitization.");
  }

  let title: string | null = null;
  if (body.title !== undefined && body.title !== null && body.title !== "") {
    if (typeof body.title !== "string") {
      throw new ValidationError("'title' must be a string.");
    }
    const sanitizedTitle = sanitizeText(body.title, MAX_TITLE_LEN);
    title = sanitizedTitle || null;
  }

  const rawType = body.type ?? body.category;
  let type = "flood";
  if (rawType !== undefined && rawType !== null && rawType !== "") {
    if (typeof rawType !== "string") {
      throw new ValidationError("'type' must be a string.");
    }
    const normalizedType = sanitizeText(rawType.toLowerCase(), 40);
    if (!ALLOWED_REPORT_TYPES.includes(normalizedType as ReportType)) {
      throw new ValidationError(
        `Invalid 'type'. Allowed: ${ALLOWED_REPORT_TYPES.join(", ")}.`
      );
    }
    type = normalizedType;
  }

  let severity: ReportSeverity = "medium";
  if (body.severity !== undefined && body.severity !== null && body.severity !== "") {
    if (
      typeof body.severity !== "string" ||
      !ALLOWED_SEVERITIES.includes(body.severity as ReportSeverity)
    ) {
      throw new ValidationError(
        `Invalid 'severity'. Allowed: ${ALLOWED_SEVERITIES.join(", ")}.`
      );
    }
    severity = body.severity as ReportSeverity;
  }

  let status: ReportStatus = "active";
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    if (
      typeof body.status !== "string" ||
      !ALLOWED_STATUSES.includes(body.status as ReportStatus)
    ) {
      throw new ValidationError(
        `Invalid 'status'. Allowed: ${ALLOWED_STATUSES.join(", ")}.`
      );
    }
    status = body.status as ReportStatus;
  }

  let photoKey: string | null = null;
  if (body.photoKey !== undefined && body.photoKey !== null && body.photoKey !== "") {
    if (typeof body.photoKey !== "string" || !body.photoKey.startsWith("reports/")) {
      throw new ValidationError("Invalid 'photoKey'.");
    }
    photoKey = body.photoKey.slice(0, 180);
  }

  const rawImage = body.imageUrl ?? body.image_url ?? body.thumbnail;
  const imgValidation = validateImageInput(rawImage);
  if (!imgValidation.valid) {
    throw new ValidationError(imgValidation.error ?? "Invalid image input.");
  }

  return {
    title,
    type,
    description,
    latitude: rawLat,
    longitude: rawLng,
    severity,
    imageUrl: imgValidation.value ?? null,
    photoKey,
    status,
    waterPresent: Boolean(body.waterPresent),
    demoMode: Boolean(body.demoMode),
  };
}

export async function createReport(
  input: CreateReportInput
): Promise<SerializedReport> {
  const data = validateCreateReportPayload(input);
  const verified = data.waterPresent;

  const created = await prisma.report.create({
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      latitude: data.latitude,
      longitude: data.longitude,
      severity: data.severity,
      imageUrl: data.imageUrl,
      photoKey: data.photoKey,
      status: data.status,
      waterPresent: data.waterPresent,
      verified,
      demoMode: data.demoMode,
    },
  });

  const [serialized] = await attachPresignedUrls([serializeReport(created)]);
  return serialized;
}

export async function listReports(
  params: ListReportsParams = {}
): Promise<ListReportsResult> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 20), 1), 100);
  const offset = Math.max(Math.trunc(params.offset ?? 0), 0);

  const where: Prisma.ReportWhereInput = {};

  if (params.type) {
    where.type = params.type;
  }
  if (params.status) {
    where.status = params.status;
  }

  const hasBbox =
    params.minLat !== undefined &&
    params.maxLat !== undefined &&
    params.minLng !== undefined &&
    params.maxLng !== undefined;

  const hasRadius =
    params.lat !== undefined &&
    params.lng !== undefined &&
    params.radiusKm !== undefined;

  if (hasBbox) {
    where.latitude = { gte: params.minLat, lte: params.maxLat };
    where.longitude = { gte: params.minLng, lte: params.maxLng };
  } else if (hasRadius) {
    const latDelta = params.radiusKm! / 111.32;
    const cosLat = Math.max(0.01, Math.cos((params.lat! * Math.PI) / 180));
    const lngDelta = params.radiusKm! / (111.32 * cosLat);
    where.latitude = { gte: params.lat! - latDelta, lte: params.lat! + latDelta };
    where.longitude = { gte: params.lng! - lngDelta, lte: params.lng! + lngDelta };
  }

  if (hasRadius) {
    // Bounding-box pre-filter in DB, then exact Haversine distance filter in memory
    const candidates = await prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const maxMeters = params.radiusKm! * 1000;
    const matched = candidates.filter(
      (r) =>
        haversineMeters(
          { lat: params.lat!, lng: params.lng! },
          { lat: r.latitude, lng: r.longitude }
        ) <= maxMeters
    );
    const total = matched.length;
    const page = matched.slice(offset, offset + limit).map(serializeReport);
    const reports = await attachPresignedUrls(page);
    return {
      reports,
      total,
      limit,
      offset,
      hasMore: offset + reports.length < total,
    };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const reports = await attachPresignedUrls(rows.map(serializeReport));
  return {
    reports,
    total,
    limit,
    offset,
    hasMore: offset + reports.length < total,
  };
}

export async function getReportById(
  id: string
): Promise<SerializedReport | null> {
  const row = await prisma.report.findUnique({ where: { id } });
  if (!row) return null;
  const [serialized] = await attachPresignedUrls([serializeReport(row)]);
  return serialized;
}

export async function getActiveVerifiedReports(
  limit = 200
): Promise<SerializedReport[]> {
  const rows = await prisma.report.findMany({
    where: { status: "active", verified: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serializeReport);
}
