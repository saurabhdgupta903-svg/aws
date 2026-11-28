import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_REPORT_TYPES,
  ALLOWED_STATUSES,
  MAX_BODY_BYTES,
  applyCorsHeaders,
  checkRateLimit,
  getClientIp,
  handleCorsPreflight,
  type ReportStatus,
  type ReportType,
} from "../../../lib/reportSecurity";
import {
  ValidationError,
  createReport,
  listReports,
  type CreateReportInput,
} from "../../../lib/reportsService";

function parseFiniteNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const limitRaw = parseFiniteNumber(sp.get("limit"));
    if (limitRaw !== undefined && (Number.isNaN(limitRaw) || limitRaw < 1)) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          { error: "Invalid 'limit' query parameter." },
          { status: 400 }
        )
      );
    }

    const offsetRaw = parseFiniteNumber(sp.get("offset"));
    if (offsetRaw !== undefined && (Number.isNaN(offsetRaw) || offsetRaw < 0)) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          { error: "Invalid 'offset' query parameter." },
          { status: 400 }
        )
      );
    }

    const typeParam = (sp.get("type") ?? sp.get("category"))?.trim().toLowerCase();
    if (
      typeParam &&
      !ALLOWED_REPORT_TYPES.includes(typeParam as ReportType)
    ) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          {
            error: `Invalid 'type' filter. Allowed: ${ALLOWED_REPORT_TYPES.join(", ")}.`,
          },
          { status: 400 }
        )
      );
    }

    const statusParam = sp.get("status")?.trim().toLowerCase();
    if (
      statusParam &&
      !ALLOWED_STATUSES.includes(statusParam as ReportStatus)
    ) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          {
            error: `Invalid 'status' filter. Allowed: ${ALLOWED_STATUSES.join(", ")}.`,
          },
          { status: 400 }
        )
      );
    }

    const minLat = parseFiniteNumber(sp.get("min_lat"));
    const maxLat = parseFiniteNumber(sp.get("max_lat"));
    const minLng = parseFiniteNumber(sp.get("min_lng"));
    const maxLng = parseFiniteNumber(sp.get("max_lng"));

    const bboxValues = [minLat, maxLat, minLng, maxLng];
    const anyBbox = bboxValues.some((v) => v !== undefined);
    const allBbox = bboxValues.every((v) => v !== undefined);
    if (anyBbox && !allBbox) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          {
            error:
              "Bounding box requires all four parameters: min_lat, max_lat, min_lng, max_lng.",
          },
          { status: 400 }
        )
      );
    }
    if (
      allBbox &&
      (bboxValues.some((v) => Number.isNaN(v)) ||
        minLat! < -90 ||
        maxLat! > 90 ||
        minLat! > maxLat! ||
        minLng! < -180 ||
        maxLng! > 180 ||
        minLng! > maxLng!)
    ) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          { error: "Invalid bounding box coordinates." },
          { status: 400 }
        )
      );
    }

    const lat = parseFiniteNumber(sp.get("lat"));
    const lng = parseFiniteNumber(sp.get("lng"));
    const radiusKm = parseFiniteNumber(sp.get("radius_km"));
    const radiusValues = [lat, lng, radiusKm];
    const anyRadius = radiusValues.some((v) => v !== undefined);
    const allRadius = radiusValues.every((v) => v !== undefined);

    if (anyRadius && !allRadius) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          {
            error:
              "Radius filter requires all three parameters: lat, lng, radius_km.",
          },
          { status: 400 }
        )
      );
    }
    if (
      allRadius &&
      (radiusValues.some((v) => Number.isNaN(v)) ||
        lat! < -90 ||
        lat! > 90 ||
        lng! < -180 ||
        lng! > 180 ||
        radiusKm! <= 0 ||
        radiusKm! > 2000)
    ) {
      return applyCorsHeaders(
        req,
        NextResponse.json(
          { error: "Invalid lat/lng/radius_km parameters." },
          { status: 400 }
        )
      );
    }

    const result = await listReports({
      limit: limitRaw,
      offset: offsetRaw,
      type: typeParam || undefined,
      status: statusParam || undefined,
      minLat: allBbox ? minLat : undefined,
      maxLat: allBbox ? maxLat : undefined,
      minLng: allBbox ? minLng : undefined,
      maxLng: allBbox ? maxLng : undefined,
      lat: allRadius ? lat : undefined,
      lng: allRadius ? lng : undefined,
      radiusKm: allRadius ? radiusKm : undefined,
    });

    return applyCorsHeaders(req, NextResponse.json(result, { status: 200 }));
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Failed to fetch reports." },
        { status: 500 }
      )
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    const res = NextResponse.json(
      { error: "Too many report submissions. Please try again shortly." },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(rate.retryAfterSec));
    return applyCorsHeaders(req, res);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Request payload too large." },
        { status: 413 }
      )
    );
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json({ error: "Failed to read request body." }, { status: 400 })
    );
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Request payload too large." },
        { status: 413 }
      )
    );
  }

  let body: CreateReportInput;
  try {
    body = JSON.parse(rawBody) as CreateReportInput;
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 })
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return applyCorsHeaders(
      req,
      NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 })
    );
  }

  try {
    const report = await createReport(body);
    return applyCorsHeaders(
      req,
      NextResponse.json({ report }, { status: 201 })
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return applyCorsHeaders(
        req,
        NextResponse.json({ error: err.message }, { status: err.status })
      );
    }
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Failed to save report." },
        { status: 500 }
      )
    );
  }
}
