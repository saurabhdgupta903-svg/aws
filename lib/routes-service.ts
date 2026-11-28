import { haversineMeters, type LatLng } from "./geo";
import { prisma } from "./prisma";

export type VehicleType = "bike" | "car" | "bus" | "walk";
export const VALID_VEHICLES: VehicleType[] = ["bike", "car", "bus", "walk"];

export interface ActiveHazardReport {
  id: string;
  type: string;
  severity: string;
  description: string;
  latitude: number;
  longitude: number;
}

export interface HazardOnRoute {
  id: string;
  type: string;
  severity: string;
  description: string;
  latitude: number;
  longitude: number;
  distanceM: number;
}

export interface ScoredRoute {
  id: string;
  geometry: [number, number][]; // [lat, lng]
  distanceM: number;
  durationS: number;
  safetyScore: number;
  hazardsOnRoute: {
    count: number;
    nearest: HazardOnRoute[];
  };
  label: "Safest" | "Fastest" | "Balanced";
  summary: string;
}

export interface RoutesApiResponse {
  routes: ScoredRoute[];
  vehicle: VehicleType;
  routingProfileUsed: string;
  profileNote: string | null;
  alternativesNote: string | null;
  noHazardData: boolean;
  cached?: boolean;
}

export interface RawProviderRoute {
  distanceM: number;
  durationS: number;
  geometry: [number, number][]; // [lat, lng]
  roadClasses: string[];
}

// ── Safety Scoring Weights (0-100 scale, higher = safer) ─────────────────
export const SAFETY_WEIGHTS = {
  BASE_SCORE: 100,
  HAZARD_RADIUS_M: 200,
  SAMPLE_STEP_M: 75,
  SEVERITY_PENALTY: {
    low: 5,
    medium: 12,
    high: 22,
    severe: 34,
  } as Record<string, number>,
  BIKE_HIGHWAY_PENALTY: 18,
  WALK_HIGHWAY_PENALTY: 25,
  BUS_NARROW_ROAD_PENALTY: 16,
  DEDUP_OVERLAP_THRESHOLD: 0.9,
} as const;

/**
 * Sample route coordinates every `stepM` (~50-100m) for hazard proximity checks.
 */
export function samplePointsAlongRoute(
  coords: [number, number][],
  stepM = SAFETY_WEIGHTS.SAMPLE_STEP_M
): LatLng[] {
  if (coords.length === 0) return [];
  const sampled: LatLng[] = [{ lat: coords[0][0], lng: coords[0][1] }];

  for (let i = 1; i < coords.length; i++) {
    const prev = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const curr = { lat: coords[i][0], lng: coords[i][1] };
    const segDist = haversineMeters(prev, curr);
    if (segDist > stepM) {
      const steps = Math.ceil(segDist / stepM);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        sampled.push({
          lat: prev.lat + (curr.lat - prev.lat) * t,
          lng: prev.lng + (curr.lng - prev.lng) * t,
        });
      }
    }
    sampled.push(curr);
  }
  return sampled;
}

/**
 * Compute geometric overlap ratio (0..1) between route A and route B.
 * Used to de-duplicate routes that overlap more than ~90%.
 */
export function computeRouteOverlap(
  geomA: [number, number][],
  geomB: [number, number][]
): number {
  const ptsA = samplePointsAlongRoute(geomA, 100);
  const ptsB = samplePointsAlongRoute(geomB, 100);
  if (ptsA.length === 0 || ptsB.length === 0) return 0;

  let matched = 0;
  for (const a of ptsA) {
    for (const b of ptsB) {
      if (haversineMeters(a, b) <= 60) {
        matched++;
        break;
      }
    }
  }
  return matched / ptsA.length;
}

export function deduplicateRoutes(
  routes: RawProviderRoute[],
  threshold = SAFETY_WEIGHTS.DEDUP_OVERLAP_THRESHOLD
): RawProviderRoute[] {
  const kept: RawProviderRoute[] = [];
  for (const candidate of routes) {
    const isDup = kept.some(
      (existing) => computeRouteOverlap(candidate.geometry, existing.geometry) > threshold
    );
    if (!isDup) {
      kept.push(candidate);
    }
  }
  return kept.slice(0, 3);
}

/**
 * Score a single route 0-100 using active DB flood reports within 200m
 * and vehicle-specific road-type penalties.
 */
export function scoreRouteSafety(
  route: RawProviderRoute,
  vehicle: VehicleType,
  activeReports: ActiveHazardReport[]
): {
  safetyScore: number;
  hazardsOnRoute: { count: number; nearest: HazardOnRoute[] };
  roadPenalty: number;
} {
  const sampled = samplePointsAlongRoute(route.geometry, SAFETY_WEIGHTS.SAMPLE_STEP_M);
  const hitMap = new Map<string, HazardOnRoute>();

  for (const rep of activeReports) {
    let minDist = Infinity;
    for (const pt of sampled) {
      const d = haversineMeters(pt, { lat: rep.latitude, lng: rep.longitude });
      if (d < minDist) minDist = d;
    }
    if (minDist <= SAFETY_WEIGHTS.HAZARD_RADIUS_M) {
      hitMap.set(rep.id, {
        id: rep.id,
        type: rep.type,
        severity: rep.severity,
        description: rep.description,
        latitude: rep.latitude,
        longitude: rep.longitude,
        distanceM: Math.round(minDist),
      });
    }
  }

  const hits = Array.from(hitMap.values()).sort((a, b) => a.distanceM - b.distanceM);

  let hazardPenalty = 0;
  for (const h of hits) {
    hazardPenalty += SAFETY_WEIGHTS.SEVERITY_PENALTY[h.severity] ?? 12;
  }

  // Road-type penalties per vehicle
  const classesLower = route.roadClasses.map((c) => c.toLowerCase());
  const hasHighway = classesLower.some(
    (c) => c.includes("motorway") || c.includes("trunk") || c.includes("highway") || c.includes("expressway")
  );
  const hasNarrow = classesLower.some(
    (c) => c.includes("residential") || c.includes("service") || c.includes("unclassified") || c.includes("lane")
  );

  let roadPenalty = 0;
  if (vehicle === "bike" && hasHighway) {
    roadPenalty += SAFETY_WEIGHTS.BIKE_HIGHWAY_PENALTY;
  } else if (vehicle === "walk" && hasHighway) {
    roadPenalty += SAFETY_WEIGHTS.WALK_HIGHWAY_PENALTY;
  } else if (vehicle === "bus" && hasNarrow) {
    roadPenalty += SAFETY_WEIGHTS.BUS_NARROW_ROAD_PENALTY;
  }

  const safetyScore = Math.max(
    0,
    Math.min(100, Math.round(SAFETY_WEIGHTS.BASE_SCORE - hazardPenalty - roadPenalty))
  );

  return {
    safetyScore,
    hazardsOnRoute: {
      count: hits.length,
      nearest: hits.slice(0, 5),
    },
    roadPenalty,
  };
}

// ── In-memory TTL cache ──────────────────────────────────────────────────
const routeCache = new Map<string, { data: RoutesApiResponse; ts: number }>();

function getCacheTtlMs(): number {
  const parsed = Number(process.env.ROUTES_CACHE_TTL_MS || "300000");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300000;
}

interface OSRMStep {
  name?: string;
  mode?: string;
  ref?: string;
}

interface OSRMResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs?: Array<{ steps?: OSRMStep[] }>;
  }>;
}

async function fetchFromOSRM(
  baseUrl: string,
  profile: string,
  from: LatLng,
  to: LatLng,
  durationMultiplier = 1
): Promise<RawProviderRoute[]> {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?alternatives=true&overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Routing service returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as OSRMResponse;
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || "No route found between selected points.");
    }

    return data.routes.map((r) => {
      const roadClasses: string[] = [];
      for (const leg of r.legs ?? []) {
        for (const step of leg.steps ?? []) {
          if (step.name) roadClasses.push(step.name);
          if (step.ref) roadClasses.push(step.ref);
        }
      }
      return {
        distanceM: r.distance,
        durationS: Math.round(r.duration * durationMultiplier),
        geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        roadClasses,
      };
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function planVehicleSafeRoutes(
  from: LatLng,
  to: LatLng,
  vehicle: VehicleType
): Promise<RoutesApiResponse> {
  const cacheKey = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}:${vehicle}`;
  const ttl = getCacheTtlMs();
  const hit = routeCache.get(cacheKey);
  if (ttl > 0 && hit && Date.now() - hit.ts < ttl) {
    return { ...hit.data, cached: true };
  }

  const osrmDrivingBase =
    process.env.OSRM_BASE_URL?.trim() || "https://router.project-osrm.org";
  const osrmBikeBase = process.env.OSRM_BIKE_BASE_URL?.trim();
  const osrmWalkBase = process.env.OSRM_WALK_BASE_URL?.trim();

  let rawRoutes: RawProviderRoute[];
  let routingProfileUsed = "osrm:driving";
  let profileNote: string | null = null;

  if (vehicle === "bike") {
    if (osrmBikeBase) {
      routingProfileUsed = "osrm:cycling";
      rawRoutes = await fetchFromOSRM(osrmBikeBase, "cycling", from, to, 1);
    } else {
      routingProfileUsed = "osrm:driving (bike speed estimate)";
      profileNote =
        "Public OSRM demo only supports driving; bike ETA is estimated and highway-heavy routes are penalized.";
      rawRoutes = await fetchFromOSRM(osrmDrivingBase, "driving", from, to, 1.35);
    }
  } else if (vehicle === "walk") {
    if (osrmWalkBase) {
      routingProfileUsed = "osrm:foot";
      rawRoutes = await fetchFromOSRM(osrmWalkBase, "foot", from, to, 1);
    } else {
      routingProfileUsed = "osrm:driving (walking speed estimate)";
      profileNote =
        "Public OSRM demo only supports driving; walking ETA is estimated (~5 km/h) and highway routes are penalized.";
      rawRoutes = await fetchFromOSRM(osrmDrivingBase, "driving", from, to, 5.5);
    }
  } else if (vehicle === "bus") {
    routingProfileUsed = "osrm:driving (large-vehicle profile)";
    profileNote =
      "Bus mode uses a large-vehicle road profile (penalizing narrow lanes), not live public transit schedules.";
    rawRoutes = await fetchFromOSRM(osrmDrivingBase, "driving", from, to, 1.2);
  } else {
    rawRoutes = await fetchFromOSRM(osrmDrivingBase, "driving", from, to, 1);
  }

  const distinct = deduplicateRoutes(rawRoutes);
  const alternativesNote =
    distinct.length < 2
      ? "Fewer than 2 distinct alternative routes were returned by the routing provider for this corridor."
      : null;

  const activeReports = await prisma.report.findMany({
    where: { status: "active" },
    select: {
      id: true,
      type: true,
      severity: true,
      description: true,
      latitude: true,
      longitude: true,
    },
  });
  const noHazardData = activeReports.length === 0;

  const scored = distinct.map((r, idx) => {
    const { safetyScore, hazardsOnRoute, roadPenalty } = scoreRouteSafety(
      r,
      vehicle,
      activeReports
    );
    const summaryParts = [
      hazardsOnRoute.count > 0
        ? `${hazardsOnRoute.count} active flood report(s) within 200m`
        : noHazardData
          ? "No active flood reports; ranked by road-type signals"
          : "Clear of active flood reports",
    ];
    if (roadPenalty > 0) {
      summaryParts.push(`road-type penalty (-${roadPenalty})`);
    }

    return {
      id: `route-${idx + 1}`,
      geometry: r.geometry,
      distanceM: Math.round(r.distanceM),
      durationS: Math.round(r.durationS),
      safetyScore,
      hazardsOnRoute,
      label: "Balanced" as ScoredRoute["label"],
      summary: summaryParts.join(" · "),
    };
  });

  // Sort safest first, then fastest
  scored.sort((a, b) => {
    if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
    return a.durationS - b.durationS;
  });

  if (scored.length > 0) {
    scored[0].label = "Safest";
    let fastestIdx = 0;
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].durationS < scored[fastestIdx].durationS) {
        fastestIdx = i;
      }
    }
    if (fastestIdx !== 0) {
      scored[fastestIdx].label = "Fastest";
    }
  }

  const response: RoutesApiResponse = {
    routes: scored,
    vehicle,
    routingProfileUsed,
    profileNote,
    alternativesNote,
    noHazardData,
  };

  if (ttl > 0) {
    routeCache.set(cacheKey, { data: response, ts: Date.now() });
  }

  return response;
}
