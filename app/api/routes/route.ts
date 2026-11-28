import { NextRequest, NextResponse } from "next/server";
import type { HazardZone, LatLng } from "@/lib/geo";
import { SEEDED_HOTSPOTS } from "@/lib/hotspots";
import { getActiveVerifiedReports } from "@/lib/reportsService";
import {
  findSafeRoutes,
  isSupportedVehicle,
  parseLatLngParam,
  RoutingProviderError,
  SUPPORTED_VEHICLES,
  type SafeRoutesResponse,
  type Vehicle,
} from "@/lib/safeRoutes";

const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

declare global {
  var __floodloopRouteCache:
    | Map<string, { data: SafeRoutesResponse; ts: number }>
    | undefined;
}

function getCacheTtlMs(): number {
  const raw = Number(process.env.ROUTES_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

function getRouteCache(): Map<string, { data: SafeRoutesResponse; ts: number }> {
  if (!globalThis.__floodloopRouteCache) {
    globalThis.__floodloopRouteCache = new Map();
  }
  return globalThis.__floodloopRouteCache;
}

function vulnerabilityToSeverity(v: number): HazardZone["severity"] {
  if (v >= 0.85) return "severe";
  if (v >= 0.7) return "high";
  if (v >= 0.5) return "medium";
  return "low";
}

async function getActiveHazardZones(): Promise<HazardZone[]> {
  const hotspotZones: HazardZone[] = SEEDED_HOTSPOTS.map((hs) => ({
    id: hs.id,
    name: hs.name,
    lat: hs.lat,
    lng: hs.lng,
    radiusM: hs.radiusM,
    severity: vulnerabilityToSeverity(hs.baseVulnerability),
    hazardType: hs.hazardType,
  }));

  let reports: Awaited<ReturnType<typeof getActiveVerifiedReports>> = [];
  try {
    reports = await getActiveVerifiedReports(200);
  } catch {
    // Continue with seeded hotspots if DB is unavailable
  }

  const reportZones: HazardZone[] = reports.map((r) => ({
    id: r.id,
    name: r.description || "Reported Flood Zone",
    lat: r.latitude,
    lng: r.longitude,
    radiusM: 300,
    severity: r.severity,
    hazardType: "reported_flood" as const,
  }));

  return [...hotspotZones, ...reportZones];
}

async function handleRouteRequest(
  from: LatLng,
  to: LatLng,
  vehicle: Vehicle
): Promise<NextResponse> {
  const cacheKey = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}|${vehicle}`;
  const cache = getRouteCache();
  const ttlMs = getCacheTtlMs();
  const hit = cache.get(cacheKey);

  if (hit && Date.now() - hit.ts < ttlMs) {
    return NextResponse.json(hit.data);
  }

  try {
    const hazardZones = await getActiveHazardZones();
    const result = await findSafeRoutes(from, to, vehicle, hazardZones);
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RoutingProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Unexpected error while computing safe routes." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const vehicleParam = req.nextUrl.searchParams.get("vehicle")?.trim().toLowerCase();

  const from = parseLatLngParam(fromParam);
  if (!from) {
    return NextResponse.json(
      { error: "Invalid or missing 'from' parameter. Expected 'lat,lng' within [-90..90, -180..180]." },
      { status: 400 }
    );
  }

  const to = parseLatLngParam(toParam);
  if (!to) {
    return NextResponse.json(
      { error: "Invalid or missing 'to' parameter. Expected 'lat,lng' within [-90..90, -180..180]." },
      { status: 400 }
    );
  }

  const vehicleRaw = vehicleParam || "car";
  if (!isSupportedVehicle(vehicleRaw)) {
    return NextResponse.json(
      {
        error: `Unsupported vehicle '${vehicleRaw}'. Supported vehicles: ${SUPPORTED_VEHICLES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  return handleRouteRequest(from, to, vehicleRaw);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      from?: string | LatLng;
      to?: string | LatLng;
      vehicle?: string;
    };

    const parseCoord = (val: string | LatLng | undefined): LatLng | null => {
      if (!val) return null;
      if (typeof val === "string") return parseLatLngParam(val);
      if (
        typeof val.lat === "number" &&
        typeof val.lng === "number" &&
        Number.isFinite(val.lat) &&
        Number.isFinite(val.lng) &&
        val.lat >= -90 &&
        val.lat <= 90 &&
        val.lng >= -180 &&
        val.lng <= 180
      ) {
        return { lat: val.lat, lng: val.lng };
      }
      return null;
    };

    const from = parseCoord(body.from);
    if (!from) {
      return NextResponse.json(
        { error: "Invalid or missing 'from' coordinates." },
        { status: 400 }
      );
    }

    const to = parseCoord(body.to);
    if (!to) {
      return NextResponse.json(
        { error: "Invalid or missing 'to' coordinates." },
        { status: 400 }
      );
    }

    const vehicleRaw = (body.vehicle ?? "car").toString().trim().toLowerCase();
    if (!isSupportedVehicle(vehicleRaw)) {
      return NextResponse.json(
        {
          error: `Unsupported vehicle '${vehicleRaw}'. Supported vehicles: ${SUPPORTED_VEHICLES.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    return handleRouteRequest(from, to, vehicleRaw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
}
