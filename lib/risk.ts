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
 * Fetch per-hotspot weather exclusively through our /api/weather server route
 * (which batches Open-Meteo and caches for 10 minutes server-side).
 */
export async function fetchWeatherForHotspots(): Promise<
  Record<string, WeatherSnapshot>
> {
  const res = await fetch("/api/weather");
  if (!res.ok) {
    throw new Error(`Weather API failed (${res.status})`);
  }
  return (await res.json()) as Record<string, WeatherSnapshot>;
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
