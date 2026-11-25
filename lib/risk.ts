import { haversineMeters } from "./geo";
import { REGIONS, type HotspotSeed, type Region } from "./hotspots";
import type { FloodReport } from "./store";

export type RiskLevel = "low" | "medium" | "high" | "severe";
export type SimulateRegionOption = "off" | "All" | Region;

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  severe: "#ef4444",
};

export interface HourlyRainPoint {
  timeLabel: string;
  precipitationMm: number;
  probabilityPct: number;
}

export interface WeatherSnapshot {
  currentRainMm: number;
  next6hRainTotalMm: number;
  next24hRainTotalMm: number;
  daily3dSumMm: number;
  maxNext6hProbPct: number;
  hourly6h: HourlyRainPoint[];
  fetchedAt: string;
}

export interface HotspotRisk {
  hotspot: HotspotSeed;
  score: number;
  level: RiskLevel;
  nearbyVerifiedReports: number;
  lastUpdated: string;
  weather: WeatherSnapshot;
}

export interface RegionalBreakdown {
  region: Region;
  total: number;
  low: number;
  medium: number;
  high: number;
  severe: number;
  worstScore: number;
  worstLevel: RiskLevel;
}

export interface StateRiskSummary {
  counts: Record<RiskLevel, number>;
  top5: HotspotRisk[];
  regionalBreakdown: RegionalBreakdown[];
  overallLevel: RiskLevel;
  overallScore: number;
}

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "severe";
}

export function createFallbackWeather(): WeatherSnapshot {
  return {
    currentRainMm: 1.2,
    next6hRainTotalMm: 8.5,
    next24hRainTotalMm: 22.0,
    daily3dSumMm: 48.0,
    maxNext6hProbPct: 40,
    hourly6h: [
      { timeLabel: "+1h", precipitationMm: 1.5, probabilityPct: 40 },
      { timeLabel: "+2h", precipitationMm: 1.8, probabilityPct: 40 },
      { timeLabel: "+3h", precipitationMm: 1.4, probabilityPct: 35 },
      { timeLabel: "+4h", precipitationMm: 1.3, probabilityPct: 35 },
      { timeLabel: "+5h", precipitationMm: 1.5, probabilityPct: 30 },
      { timeLabel: "+6h", precipitationMm: 1.0, probabilityPct: 30 },
    ],
    fetchedAt: "",
  };
}

/**
 * Compute current YYYY-MM-DDTHH in Asia/Kolkata (IST) so Open-Meteo
 * hourly timestamps (which are in Asia/Kolkata) align accurately.
 */
function getCurrentKolkataHourPrefix(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}`;
}

interface OpenMeteoLocationPayload {
  current?: { rain?: number; time?: string };
  hourly?: {
    time?: string[];
    precipitation?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    precipitation_sum?: number[];
  };
}

const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cachedWeatherMap: {
  data: Record<string, WeatherSnapshot>;
  timestamp: number;
} | null = null;

export async function fetchWeatherForHotspots(
  hotspots: HotspotSeed[]
): Promise<Record<string, WeatherSnapshot>> {
  const now = Date.now();
  if (
    cachedWeatherMap &&
    now - cachedWeatherMap.timestamp < WEATHER_CACHE_TTL_MS
  ) {
    return cachedWeatherMap.data;
  }

  if (hotspots.length === 0) return {};

  const lats = hotspots.map((h) => h.lat.toFixed(4)).join(",");
  const lngs = hotspots.map((h) => h.lng.toFixed(4)).join(",");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=rain&hourly=precipitation,precipitation_probability&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FKolkata`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status})`);
  }

  const raw = (await res.json()) as
    | OpenMeteoLocationPayload
    | OpenMeteoLocationPayload[];
  const payloads = Array.isArray(raw) ? raw : [raw];
  const istHourPrefix = getCurrentKolkataHourPrefix();
  const fetchedAt = new Date().toISOString();

  const result: Record<string, WeatherSnapshot> = {};

  hotspots.forEach((hs, idx) => {
    const loc = payloads[idx] ?? payloads[0];
    const currentRainMm = Number(loc?.current?.rain ?? 0);
    const times = loc?.hourly?.time ?? [];
    const precips = loc?.hourly?.precipitation ?? [];
    const probs = loc?.hourly?.precipitation_probability ?? [];
    const dailySums = loc?.daily?.precipitation_sum ?? [];

    let startIdx = times.findIndex((t) => t >= istHourPrefix);
    if (startIdx < 0) startIdx = 0;

    const hourly6h: HourlyRainPoint[] = [];
    let next6hRainTotalMm = 0;
    let next24hRainTotalMm = 0;
    let maxNext6hProbPct = 0;

    for (let i = 0; i < 24; i++) {
      const hIdx = startIdx + i;
      if (hIdx >= times.length) break;
      const mm = Number(precips[hIdx] ?? 0);
      const prob = Number(probs[hIdx] ?? 0);
      next24hRainTotalMm += mm;

      if (i < 6) {
        next6hRainTotalMm += mm;
        if (prob > maxNext6hProbPct) maxNext6hProbPct = prob;
        hourly6h.push({
          timeLabel: times[hIdx]?.slice(11, 16) || `+${i + 1}h`,
          precipitationMm: Number(mm.toFixed(1)),
          probabilityPct: prob,
        });
      }
    }

    const daily3dSumMm = dailySums
      .slice(0, 3)
      .reduce((acc, v) => acc + Number(v ?? 0), 0);

    result[hs.id] = {
      currentRainMm: Number(currentRainMm.toFixed(1)),
      next6hRainTotalMm: Number(next6hRainTotalMm.toFixed(1)),
      next24hRainTotalMm: Number(next24hRainTotalMm.toFixed(1)),
      daily3dSumMm: Number(daily3dSumMm.toFixed(1)),
      maxNext6hProbPct,
      hourly6h,
      fetchedAt,
    };
  });

  cachedWeatherMap = { data: result, timestamp: now };
  return result;
}

export function applyRainSimulationToMap(
  weatherMap: Record<string, WeatherSnapshot>,
  hotspots: HotspotSeed[],
  simulateRegion: SimulateRegionOption
): Record<string, WeatherSnapshot> {
  if (simulateRegion === "off") return weatherMap;

  const next: Record<string, WeatherSnapshot> = {};
  for (const hs of hotspots) {
    const base = weatherMap[hs.id] ?? createFallbackWeather();
    const matches = simulateRegion === "All" || hs.region === simulateRegion;
    if (!matches) {
      next[hs.id] = base;
    } else {
      next[hs.id] = {
        ...base,
        currentRainMm: 44.0,
        next6hRainTotalMm: 122.0,
        next24hRainTotalMm: 210.0,
        daily3dSumMm: 340.0,
        maxNext6hProbPct: 96,
        hourly6h: base.hourly6h.map((pt, idx) => ({
          ...pt,
          precipitationMm: Number((16.5 + (idx % 3) * 6.5).toFixed(1)),
          probabilityPct: 96,
        })),
      };
    }
  }
  return next;
}

export function computeHotspotRisk(
  hotspot: HotspotSeed,
  weather: WeatherSnapshot,
  reports: FloodReport[]
): HotspotRisk {
  const nearbyVerifiedReports = reports.filter(
    (r) =>
      r.verified &&
      haversineMeters(
        { lat: hotspot.lat, lng: hotspot.lng },
        { lat: r.lat, lng: r.lng }
      ) <= 500
  ).length;

  const reportScore = Math.min(14, nearbyVerifiedReports * 8);
  const probScore = Math.min(10, (weather.maxNext6hProbPct / 100) * 10);
  let rawScore = 0;

  if (hotspot.hazardType === "river_flood") {
    // River floods follow upstream 24h & 3-day rain with delay + river proximity
    const rainNowScore = Math.min(10, (weather.currentRainMm / 40) * 10);
    const rain24hScore = Math.min(28, (weather.next24hRainTotalMm / 160) * 28);
    const daily3dScore = Math.min(14, (weather.daily3dSumMm / 260) * 14);
    const riverProxScore = hotspot.baseVulnerability * 26;
    rawScore =
      rainNowScore +
      rain24hScore +
      daily3dScore +
      riverProxScore +
      probScore +
      reportScore;
  } else if (hotspot.hazardType === "ghat_landslide") {
    // Ghat landslides correlate strongly with 24h saturation + slope vulnerability
    const rainNowScore = Math.min(14, (weather.currentRainMm / 40) * 14);
    const rain24hScore = Math.min(36, (weather.next24hRainTotalMm / 150) * 36);
    const slopeScore = hotspot.baseVulnerability * 26;
    rawScore = rainNowScore + rain24hScore + slopeScore + probScore + reportScore;
  } else {
    // Urban waterlogging: intense short-term current + 6h rain
    const rainNowScore = Math.min(28, (weather.currentRainMm / 40) * 28);
    const rain6hScore = Math.min(24, (weather.next6hRainTotalMm / 100) * 24);
    const baseScore = hotspot.baseVulnerability * 24;
    rawScore = rainNowScore + rain6hScore + baseScore + probScore + reportScore;
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    hotspot,
    score,
    level: scoreToRiskLevel(score),
    nearbyVerifiedReports,
    lastUpdated: weather.fetchedAt,
    weather,
  };
}

/**
 * City risk = worst hotspot score in that city.
 */
export function computeCityRisk(
  hotspotRisks: HotspotRisk[],
  cityName: string
): { score: number; level: RiskLevel } {
  const cityHotspots = hotspotRisks.filter(
    (h) => h.hotspot.city.toLowerCase() === cityName.toLowerCase()
  );
  const target = cityHotspots.length > 0 ? cityHotspots : hotspotRisks;
  if (target.length === 0) return { score: 0, level: "low" };
  const worst = Math.max(...target.map((h) => h.score));
  return { score: worst, level: scoreToRiskLevel(worst) };
}

export function computeStateSummary(
  hotspotRisks: HotspotRisk[]
): StateRiskSummary {
  const counts: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    severe: 0,
  };

  for (const hr of hotspotRisks) {
    counts[hr.level] += 1;
  }

  const top5 = [...hotspotRisks]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const regionalBreakdown: RegionalBreakdown[] = REGIONS.map((region) => {
    const items = hotspotRisks.filter((h) => h.hotspot.region === region);
    const regCounts: Record<RiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      severe: 0,
    };
    let worstScore = 0;
    for (const item of items) {
      regCounts[item.level] += 1;
      if (item.score > worstScore) worstScore = item.score;
    }
    return {
      region,
      total: items.length,
      ...regCounts,
      worstScore,
      worstLevel: scoreToRiskLevel(worstScore),
    };
  });

  const avg =
    hotspotRisks.length > 0
      ? hotspotRisks.reduce((s, h) => s + h.score, 0) / hotspotRisks.length
      : 0;
  const peak = top5[0]?.score ?? 0;
  const overallScore = Math.round(avg * 0.45 + peak * 0.55);

  return {
    counts,
    top5,
    regionalBreakdown,
    overallScore,
    overallLevel: scoreToRiskLevel(overallScore),
  };
}
