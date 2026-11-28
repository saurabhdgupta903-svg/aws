import type { HazardType } from "./hotspots";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface HazardZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  severity: "low" | "medium" | "high" | "severe";
  hazardType: HazardType | "reported_flood";
}

export interface PlaceResult {
  displayName: string;
  lat: number;
  lng: number;
}

export interface EvaluatedRoute {
  id: string;
  label: string;
  coordinates: [number, number][]; // [lat, lng] for Leaflet
  distanceM: number;
  durationS: number;
  intersectedZones: HazardZone[];
  isSafe: boolean;
  isDetour?: boolean;
}

export interface RoutePlanResult {
  selectedRoute: EvaluatedRoute;
  rejectedRoutes: EvaluatedRoute[];
  allFlooded: boolean;
  avoidedZonesCount: number;
  avoidanceMessage: string | null;
}

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function searchMaharashtraPlaces(
  query: string
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const res = await fetch(
    `/api/geocode?q=${encodeURIComponent(trimmed)}`
  );
  if (!res.ok) {
    throw new Error(`Geocode search failed (${res.status})`);
  }
  return (await res.json()) as PlaceResult[];
}

interface OSRMRoute {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][]; // [lng, lat]
  };
}

async function fetchOSRMRoutes(
  src: LatLng,
  dst: LatLng,
  via?: LatLng
): Promise<OSRMRoute[]> {
  const points = via
    ? `${src.lng},${src.lat};${via.lng},${via.lat};${dst.lng},${dst.lat}`
    : `${src.lng},${src.lat};${dst.lng},${dst.lat}`;

  const url = `https://router.project-osrm.org/route/v1/driving/${points}?alternatives=true&overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`OSRM routing service returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      code: string;
      message?: string;
      routes?: OSRMRoute[];
    };
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(
        data.message || "No driving route found between the selected points."
      );
    }
    return data.routes;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Routing request timed out. Please retry.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sample route geometry every ~200m so thin hotspots on long intercity
 * highways are never skipped between sparse OSRM vertices.
 */
export function sampleRoutePoints(
  coordsLatLng: [number, number][],
  maxStepM = 200
): LatLng[] {
  if (coordsLatLng.length === 0) return [];
  const sampled: LatLng[] = [
    { lat: coordsLatLng[0][0], lng: coordsLatLng[0][1] },
  ];

  for (let i = 1; i < coordsLatLng.length; i++) {
    const prev = { lat: coordsLatLng[i - 1][0], lng: coordsLatLng[i - 1][1] };
    const curr = { lat: coordsLatLng[i][0], lng: coordsLatLng[i][1] };
    const segDist = haversineMeters(prev, curr);

    if (segDist > maxStepM) {
      const steps = Math.ceil(segDist / maxStepM);
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

function findIntersectedZones(
  coordsLatLng: [number, number][],
  hazardZones: HazardZone[]
): HazardZone[] {
  const hit = new Map<string, HazardZone>();
  const points = sampleRoutePoints(coordsLatLng, 200);

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    for (const zone of hazardZones) {
      if (hit.has(zone.id)) continue;
      const dist = haversineMeters(pt, { lat: zone.lat, lng: zone.lng });
      if (dist <= zone.radiusM) {
        hit.set(zone.id, zone);
      }
    }
  }
  return Array.from(hit.values());
}

function formatHazardLabel(type: HazardZone["hazardType"]): string {
  switch (type) {
    case "river_flood":
      return "river flood";
    case "reported_flood":
      return "reported flood";
    default:
      return "waterlogging";
  }
}

function computeDetourWaypoints(
  src: LatLng,
  dst: LatLng,
  zone: HazardZone
): [LatLng, LatLng] {
  const dLat = dst.lat - src.lat;
  const dLng = dst.lng - src.lng;
  const len = Math.hypot(dLat, dLng) || 1;
  const perpLat = -dLng / len;
  const perpLng = dLat / len;

  const offsetM = zone.radiusM + 500;
  const offsetDeg = offsetM / 111320;

  return [
    {
      lat: zone.lat + perpLat * offsetDeg,
      lng: zone.lng + perpLng * offsetDeg,
    },
    {
      lat: zone.lat - perpLat * offsetDeg,
      lng: zone.lng - perpLng * offsetDeg,
    },
  ];
}

function toEvaluatedRoute(
  raw: OSRMRoute,
  id: string,
  label: string,
  hazardZones: HazardZone[],
  isDetour = false
): EvaluatedRoute {
  const coordsLatLng: [number, number][] = raw.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng]
  );
  const intersectedZones = findIntersectedZones(coordsLatLng, hazardZones);
  return {
    id,
    label,
    coordinates: coordsLatLng,
    distanceM: raw.distance,
    durationS: raw.duration,
    intersectedZones,
    isSafe: intersectedZones.length === 0,
    isDetour,
  };
}

export async function planSafeRoute(
  src: LatLng,
  dst: LatLng,
  hazardZones: HazardZone[]
): Promise<RoutePlanResult> {
  const activeHazards = hazardZones.filter(
    (z) => z.severity === "high" || z.severity === "severe"
  );

  const rawRoutes = await fetchOSRMRoutes(src, dst);
  let evaluated = rawRoutes.map((r, idx) =>
    toEvaluatedRoute(r, `route-${idx + 1}`, `Route ${idx + 1}`, activeHazards)
  );

  let safeRoutes = evaluated.filter((r) => r.isSafe);

  if (safeRoutes.length === 0 && activeHazards.length > 0) {
    const firstBlocked = evaluated[0];
    const targetZone = firstBlocked?.intersectedZones[0];
    if (targetZone) {
      const [wpA, wpB] = computeDetourWaypoints(src, dst, targetZone);
      const detourCandidates: EvaluatedRoute[] = [];
      for (const [idx, wp] of [wpA, wpB].entries()) {
        try {
          const detours = await fetchOSRMRoutes(src, dst, wp);
          detours.forEach((d, dIdx) => {
            detourCandidates.push(
              toEvaluatedRoute(
                d,
                `detour-${idx}-${dIdx}`,
                `Detour ${idx + 1}`,
                activeHazards,
                true
              )
            );
          });
        } catch {
          // Detour waypoint may be off-road; ignore
        }
      }
      if (detourCandidates.length > 0) {
        evaluated = [...evaluated, ...detourCandidates];
        safeRoutes = evaluated.filter((r) => r.isSafe);
      }
    }
  }

  if (safeRoutes.length > 0) {
    safeRoutes.sort((a, b) => a.durationS - b.durationS);
    const selectedRoute = safeRoutes[0];
    const rejectedRoutes = evaluated.filter((r) => !r.isSafe);

    const avoidedMap = new Map<string, HazardZone>();
    rejectedRoutes.forEach((r) =>
      r.intersectedZones.forEach((z) => avoidedMap.set(z.id, z))
    );
    const avoidedList = Array.from(avoidedMap.values());
    const avoidanceMessage =
      avoidedList.length > 0
        ? `Avoided ${avoidedList
            .map((z) => `${z.name} (${formatHazardLabel(z.hazardType)})`)
            .join(", ")}`
        : null;

    return {
      selectedRoute,
      rejectedRoutes,
      allFlooded: false,
      avoidedZonesCount: avoidedList.length,
      avoidanceMessage,
    };
  }

  evaluated.sort((a, b) => {
    if (a.intersectedZones.length !== b.intersectedZones.length) {
      return a.intersectedZones.length - b.intersectedZones.length;
    }
    return a.durationS - b.durationS;
  });

  const selectedRoute = evaluated[0];
  const rejectedRoutes = evaluated.slice(1);

  return {
    selectedRoute,
    rejectedRoutes,
    allFlooded: true,
    avoidedZonesCount: 0,
    avoidanceMessage: null,
  };
}
