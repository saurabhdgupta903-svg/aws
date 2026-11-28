import { haversineMeters, sampleRoutePoints, type HazardZone, type LatLng } from "./geo";

export const SUPPORTED_VEHICLES = ["bike", "car", "bus", "walk"] as const;
export type Vehicle = (typeof SUPPORTED_VEHICLES)[number];

export type OSRMProfile = "cycling" | "driving" | "foot";

export interface OSRMStep {
  distance: number;
  duration: number;
  name?: string;
  ref?: string;
  mode?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    bearing_before?: number;
    bearing_after?: number;
  };
}

export interface OSRMRouteRaw {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][]; // [lng, lat]
  };
  legs?: Array<{
    steps?: OSRMStep[];
  }>;
}

export interface NearbyHazardSummary {
  id: string;
  name: string;
  severity: HazardZone["severity"];
  distance_m: number;
  lat: number;
  lng: number;
}

export type RouteLabel = "Safest" | "Fastest" | "Balanced";

export interface SafeRoute {
  id: string;
  geometry: [number, number][]; // [lat, lng] for Leaflet
  distance_m: number;
  duration_s: number;
  safety_score: number; // 0-100, higher is safer
  hazards_on_route: {
    count: number;
    nearest: NearbyHazardSummary[];
  };
  label: RouteLabel;
  summary: string;
}

export interface SafeRoutesResponse {
  routes: SafeRoute[];
  vehicle: Vehicle;
  profile_used: OSRMProfile;
  hazard_data_connected: boolean;
  bus_disclaimer?: string;
}

export const BUS_ROUTING_DISCLAIMER =
  "Bus routing uses the driving (car) profile because the public OSRM service has no dedicated bus or transit routing profile.";

// ── Safety Score Weights (tune these) ────────────────────────────────────────
export const SAFETY_WEIGHTS = {
  HAZARD_WEIGHT: 0.6, // Weight for active hazard proximity along the route
  ROAD_TYPE_WEIGHT: 0.25, // Weight for vehicle-specific road suitability
  COMPLEXITY_WEIGHT: 0.15, // Weight for route complexity (sharp turns & road changes)
  SAMPLE_STEP_M: 75, // Sample route geometry every ~75 m
  HAZARD_PROXIMITY_M: 200, // Count active hazards within 200 m of the route
  MAX_HAZARD_WEIGHT_SUM: 3.0, // Weighted hazard sum that saturates hazardPenalty at 1.0
} as const;

export const SEVERITY_MULTIPLIER: Record<HazardZone["severity"], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.8,
  severe: 1.0,
};

const VEHICLE_PROFILE_MAP: Record<Vehicle, OSRMProfile> = {
  bike: "cycling",
  car: "driving",
  bus: "driving",
  walk: "foot",
};

export function isSupportedVehicle(value: string): value is Vehicle {
  return (SUPPORTED_VEHICLES as readonly string[]).includes(value);
}

export function mapVehicleToProfile(vehicle: Vehicle): {
  profile: OSRMProfile;
  busDisclaimer?: string;
} {
  const profile = VEHICLE_PROFILE_MAP[vehicle];
  if (!profile) {
    throw new Error(`Unsupported vehicle: ${vehicle}`);
  }
  return {
    profile,
    busDisclaimer: vehicle === "bus" ? BUS_ROUTING_DISCLAIMER : undefined,
  };
}

export function parseLatLngParam(raw: string | null | undefined): LatLng | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export class RoutingProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RoutingProviderError";
    this.status = status;
  }
}

export type FetchLike = typeof fetch;

function getOsrmBaseUrl(): string {
  return (process.env.OSRM_BASE_URL?.trim() || "https://router.project-osrm.org").replace(
    /\/+$/,
    ""
  );
}

export async function fetchOSRMRoutesWithProfile(
  src: LatLng,
  dst: LatLng,
  profile: OSRMProfile,
  via?: LatLng,
  fetcher: FetchLike = fetch
): Promise<OSRMRouteRaw[]> {
  const points = via
    ? `${src.lng},${src.lat};${via.lng},${via.lat};${dst.lng},${dst.lat}`
    : `${src.lng},${src.lat};${dst.lng},${dst.lat}`;

  const baseUrl = getOsrmBaseUrl();
  const url = `${baseUrl}/route/v1/${profile}/${points}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetcher(url, { signal: controller.signal });
    if (res.status === 429) {
      throw new RoutingProviderError(
        "Routing provider rate limit reached. Please retry in a moment.",
        429
      );
    }
    if (!res.ok) {
      throw new RoutingProviderError(
        `Routing provider returned HTTP ${res.status}`,
        502
      );
    }
    const data = (await res.json()) as {
      code: string;
      message?: string;
      routes?: OSRMRouteRaw[];
    };
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return [];
    }
    return data.routes;
  } catch (err) {
    if (err instanceof RoutingProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new RoutingProviderError("Routing request timed out. Please retry.", 504);
    }
    throw new RoutingProviderError("Failed to reach routing provider.", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compute geometric overlap ratio (0..1) between two [lat, lng] routes.
 * Samples points along each route and checks what fraction of points on the
 * shorter route fall within `toleranceM` of the other route.
 */
export function computeGeometryOverlap(
  coordsA: [number, number][],
  coordsB: [number, number][],
  toleranceM = 80
): number {
  const ptsA = sampleRoutePoints(coordsA, 100);
  const ptsB = sampleRoutePoints(coordsB, 100);
  if (ptsA.length === 0 || ptsB.length === 0) return 0;

  const [shorter, longer] = ptsA.length <= ptsB.length ? [ptsA, ptsB] : [ptsB, ptsA];
  let matched = 0;

  for (const pt of shorter) {
    for (const other of longer) {
      if (haversineMeters(pt, other) <= toleranceM) {
        matched += 1;
        break;
      }
    }
  }

  return matched / shorter.length;
}

/**
 * Remove duplicate routes whose geometry overlaps more than `overlapThreshold` (default 90%).
 */
export function deduplicateRoutes<T extends { geometry: [number, number][] }>(
  routes: T[],
  overlapThreshold = 0.9
): T[] {
  const unique: T[] = [];
  for (const candidate of routes) {
    const isDup = unique.some(
      (existing) => computeGeometryOverlap(existing.geometry, candidate.geometry) > overlapThreshold
    );
    if (!isDup) {
      unique.push(candidate);
    }
  }
  return unique;
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiffDeg(b1: number, b2: number): number {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function countGeometrySharpTurns(
  sampledPoints: LatLng[],
  thresholdDeg = 45
): { sharpTurns: number; severeTurns: number } {
  let sharpTurns = 0;
  let severeTurns = 0;
  if (sampledPoints.length < 3) return { sharpTurns, severeTurns };

  let prevBearing = bearingDeg(sampledPoints[0], sampledPoints[1]);
  for (let i = 2; i < sampledPoints.length; i++) {
    const dist = haversineMeters(sampledPoints[i - 1], sampledPoints[i]);
    if (dist < 15) continue; // Skip micro-jitter
    const currBearing = bearingDeg(sampledPoints[i - 1], sampledPoints[i]);
    const turn = angleDiffDeg(prevBearing, currBearing);
    if (turn > thresholdDeg) sharpTurns += 1;
    if (turn > 60) severeTurns += 1;
    prevBearing = currBearing;
  }
  return { sharpTurns, severeTurns };
}

const HIGHWAY_PATTERN = /\b(nh|sh|expressway|highway|freeway|motorway|bypass|weh|eeh)\b/i;
const NARROW_RESIDENTIAL_PATTERN =
  /\b(lane|gali|alley|colony|society|cross|nagar|wadi|subway|internal)\b/i;

function analyzeSteps(steps: OSRMStep[], totalDistanceM: number) {
  let highwayDistanceM = 0;
  let narrowDistanceM = 0;
  let roadChanges = 0;
  let prevRoadName = "";

  for (const step of steps) {
    const label = `${step.ref ?? ""} ${step.name ?? ""}`.trim();
    if (HIGHWAY_PATTERN.test(label)) {
      highwayDistanceM += step.distance;
    } else if (NARROW_RESIDENTIAL_PATTERN.test(label)) {
      narrowDistanceM += step.distance;
    }
    if (label && prevRoadName && label !== prevRoadName) {
      roadChanges += 1;
    }
    if (label) prevRoadName = label;
  }

  const denom = Math.max(1, totalDistanceM);
  return {
    highwayShare: highwayDistanceM / denom,
    narrowShare: narrowDistanceM / denom,
    roadChanges,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface ScoreInput {
  coordinates: [number, number][]; // [lat, lng]
  distanceM: number;
  durationS: number;
  vehicle: Vehicle;
  hazardZones: HazardZone[];
  steps?: OSRMStep[];
}

export interface ScoreResult {
  safety_score: number;
  hazards_on_route: {
    count: number;
    nearest: NearbyHazardSummary[];
  };
  sharpTurns: number;
}

/**
 * Compute a 0-100 safety score for a single route (higher is safer).
 *
 * Formula:
 *   safety_score = 100 * (
 *     1
 *     - HAZARD_WEIGHT * hazardPenalty
 *     - ROAD_TYPE_WEIGHT * roadTypePenalty
 *     - COMPLEXITY_WEIGHT * complexityPenalty
 *   )
 *
 * 1. hazardPenalty: Samples route every ~75 m, finds active hazards within 200 m,
 *    weights each by severity (low=0.25, medium=0.5, high=0.8, severe=1.0),
 *    and normalizes against MAX_HAZARD_WEIGHT_SUM (3.0).
 * 2. roadTypePenalty: Vehicle-specific suitability using OSRM step road names/refs
 *    and route geometry (e.g., bikes avoid highways/very long corridors, buses avoid
 *    narrow shortcuts & sharp turns, cars prefer main roads).
 * 3. complexityPenalty: Normalizes sharp turns (>45 deg) and road-type/name changes.
 */
export function computeSafetyScore(input: ScoreInput): ScoreResult {
  const { coordinates, distanceM, vehicle, hazardZones, steps = [] } = input;
  const sampledPoints = sampleRoutePoints(coordinates, SAFETY_WEIGHTS.SAMPLE_STEP_M);

  // 1. Hazard proximity penalty
  const nearbyMap = new Map<string, NearbyHazardSummary & { severityWeight: number }>();
  for (const zone of hazardZones) {
    let minDist = Infinity;
    for (const pt of sampledPoints) {
      const d = haversineMeters(pt, { lat: zone.lat, lng: zone.lng });
      if (d < minDist) minDist = d;
    }
    if (minDist <= SAFETY_WEIGHTS.HAZARD_PROXIMITY_M) {
      nearbyMap.set(zone.id, {
        id: zone.id,
        name: zone.name,
        severity: zone.severity,
        distance_m: Math.round(minDist),
        lat: zone.lat,
        lng: zone.lng,
        severityWeight: SEVERITY_MULTIPLIER[zone.severity],
      });
    }
  }

  const nearbyList = Array.from(nearbyMap.values()).sort(
    (a, b) => a.distance_m - b.distance_m
  );
  const weightedHazardSum = nearbyList.reduce((acc, h) => acc + h.severityWeight, 0);
  const hazardPenalty = clamp(
    weightedHazardSum / SAFETY_WEIGHTS.MAX_HAZARD_WEIGHT_SUM,
    0,
    1
  );

  // 2. Road-type & vehicle suitability penalty
  const { sharpTurns, severeTurns } = countGeometrySharpTurns(sampledPoints, 45);
  const stepStats = analyzeSteps(steps, distanceM);
  const distanceKm = distanceM / 1000;

  let roadTypePenalty = 0.2; // neutral baseline
  if (vehicle === "bike") {
    const longPenalty = distanceKm > 50 ? 0.5 : distanceKm < 10 ? -0.1 : 0.1;
    roadTypePenalty = clamp(0.15 + stepStats.highwayShare * 0.7 + longPenalty, 0, 1);
  } else if (vehicle === "car") {
    // Cars prefer main arterial roads / highways (especially at night) over narrow alleys
    const highwayBonus = stepStats.highwayShare * 0.25;
    const narrowPenalty = stepStats.narrowShare * 0.6;
    roadTypePenalty = clamp(0.2 + narrowPenalty - highwayBonus, 0, 1);
  } else if (vehicle === "bus") {
    // Buses need wide arterial roads; penalize narrow residential shortcuts and sharp turns
    const turnPenalty = Math.min(0.5, severeTurns * 0.08);
    roadTypePenalty = clamp(0.15 + stepStats.narrowShare * 0.7 + turnPenalty, 0, 1);
  } else if (vehicle === "walk") {
    const longWalkPenalty = distanceKm > 5 ? clamp((distanceKm - 5) / 10, 0, 0.6) : 0;
    roadTypePenalty = clamp(0.1 + stepStats.highwayShare * 0.8 + longWalkPenalty, 0, 1);
  }

  // 3. Route complexity penalty (sharp turns + road-name transitions per km)
  const turnsPerKm = sharpTurns / Math.max(1, distanceKm);
  const changesPerKm = stepStats.roadChanges / Math.max(1, distanceKm);
  const complexityPenalty = clamp(turnsPerKm / 6 + changesPerKm / 8, 0, 1);

  const rawScore =
    100 *
    (1 -
      SAFETY_WEIGHTS.HAZARD_WEIGHT * hazardPenalty -
      SAFETY_WEIGHTS.ROAD_TYPE_WEIGHT * roadTypePenalty -
      SAFETY_WEIGHTS.COMPLEXITY_WEIGHT * complexityPenalty);

  return {
    safety_score: Math.round(clamp(rawScore, 0, 100)),
    hazards_on_route: {
      count: nearbyList.length,
      nearest: nearbyList.slice(0, 5).map(({ id, name, severity, distance_m, lat, lng }) => ({
        id,
        name,
        severity,
        distance_m,
        lat,
        lng,
      })),
    },
    sharpTurns,
  };
}

function buildRouteSummary(
  label: RouteLabel,
  route: {
    duration_s: number;
    safety_score: number;
    hazards_on_route: { count: number; nearest: NearbyHazardSummary[] };
  },
  fastestDurationS: number
): string {
  const etaMin = Math.max(1, Math.round(route.duration_s / 60));
  const hazardCount = route.hazards_on_route.count;
  const firstHazard = route.hazards_on_route.nearest[0]?.name;

  if (label === "Safest") {
    if (hazardCount === 0) {
      return `Safest: Clears all active flood hazards (${etaMin} min, score ${route.safety_score}/100).`;
    }
    return `Safest: Lowest hazard exposure (${hazardCount} nearby${firstHazard ? `, e.g. ${firstHazard}` : ""}).`;
  }

  if (label === "Fastest") {
    const extraInfo =
      hazardCount > 0
        ? `passes near ${hazardCount} hazard${hazardCount > 1 ? "s" : ""}${firstHazard ? ` (${firstHazard})` : ""}`
        : "clear of active hazards";
    return `Fastest: Shortest travel time (${etaMin} min), ${extraInfo}.`;
  }

  const diffMin = Math.max(0, Math.round((route.duration_s - fastestDurationS) / 60));
  return `Balanced: ${diffMin > 0 ? `+${diffMin} min vs fastest` : `${etaMin} min`}, ${hazardCount} hazard${hazardCount === 1 ? "" : "s"} nearby.`;
}

function generateViaNudges(src: LatLng, dst: LatLng): LatLng[] {
  const midLat = (src.lat + dst.lat) / 2;
  const midLng = (src.lng + dst.lng) / 2;
  const dLat = dst.lat - src.lat;
  const dLng = dst.lng - src.lng;
  const len = Math.hypot(dLat, dLng) || 1;
  const perpLat = -dLng / len;
  const perpLng = dLat / len;

  return [
    { lat: midLat + perpLat * 0.012, lng: midLng + perpLng * 0.012 },
    { lat: midLat - perpLat * 0.012, lng: midLng - perpLng * 0.012 },
    { lat: midLat + perpLat * 0.025, lng: midLng + perpLng * 0.025 },
    { lat: midLat - perpLat * 0.025, lng: midLng - perpLng * 0.025 },
  ];
}

export interface FindSafeRoutesOptions {
  fetcher?: FetchLike;
}

export async function findSafeRoutes(
  from: LatLng,
  to: LatLng,
  vehicle: Vehicle,
  hazardZones: HazardZone[],
  options: FindSafeRoutesOptions = {}
): Promise<SafeRoutesResponse> {
  const { profile, busDisclaimer } = mapVehicleToProfile(vehicle);
  const fetcher = options.fetcher ?? fetch;

  const rawCandidates: OSRMRouteRaw[] = await fetchOSRMRoutesWithProfile(
    from,
    to,
    profile,
    undefined,
    fetcher
  );

  const toCandidate = (raw: OSRMRouteRaw) => ({
    raw,
    geometry: raw.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
  });

  let distinct = deduplicateRoutes(rawCandidates.map(toCandidate));

  // If OSRM returned fewer than 3 distinct routes, try via-point nudges
  if (distinct.length < 3) {
    const nudges = generateViaNudges(from, to);
    for (const via of nudges) {
      if (distinct.length >= 3) break;
      try {
        const extra = await fetchOSRMRoutesWithProfile(from, to, profile, via, fetcher);
        distinct = deduplicateRoutes([...distinct, ...extra.map(toCandidate)]);
      } catch (err) {
        // If rate-limited or timed out on a nudge, stop nudging and use what we have
        if (err instanceof RoutingProviderError && err.status === 429) {
          break;
        }
      }
    }
  }

  if (distinct.length === 0) {
    throw new RoutingProviderError(
      `No ${vehicle} route found between the selected points.`,
      404
    );
  }

  // Score every distinct candidate
  const scored = distinct.map((cand, idx) => {
    const steps = cand.raw.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
    const score = computeSafetyScore({
      coordinates: cand.geometry,
      distanceM: cand.raw.distance,
      durationS: cand.raw.duration,
      vehicle,
      hazardZones,
      steps,
    });
    return {
      id: `route-${vehicle}-${idx + 1}`,
      geometry: cand.geometry,
      distance_m: Math.round(cand.raw.distance),
      duration_s: Math.round(cand.raw.duration),
      safety_score: score.safety_score,
      hazards_on_route: score.hazards_on_route,
    };
  });

  // Sort safest first (tie-break by duration)
  scored.sort((a, b) => {
    if (b.safety_score !== a.safety_score) return b.safety_score - a.safety_score;
    return a.duration_s - b.duration_s;
  });

  const topRoutes = scored.slice(0, 3);
  const fastestDurationS = Math.min(...topRoutes.map((r) => r.duration_s));

  // Assign labels: index 0 is always Safest; among remaining, lowest duration is Fastest
  let fastestId: string | null = null;
  if (topRoutes.length > 1) {
    const remaining = topRoutes.slice(1);
    fastestId = remaining.reduce((best, cur) =>
      cur.duration_s < best.duration_s ? cur : best
    ).id;
  }

  const labeledRoutes: SafeRoute[] = topRoutes.map((r, idx) => {
    const label: RouteLabel =
      idx === 0 ? "Safest" : r.id === fastestId ? "Fastest" : "Balanced";
    return {
      ...r,
      label,
      summary: buildRouteSummary(label, r, fastestDurationS),
    };
  });

  return {
    routes: labeledRoutes,
    vehicle,
    profile_used: profile,
    hazard_data_connected: hazardZones.length > 0,
    ...(busDisclaimer ? { bus_disclaimer: busDisclaimer } : {}),
  };
}
