import { NextResponse } from "next/server";
import { SEEDED_HOTSPOTS } from "@/lib/hotspots";
import type { HourlyRainPoint, WeatherSnapshot } from "@/lib/risk";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cachedServerWeather: {
  data: Record<string, WeatherSnapshot>;
  timestamp: number;
} | null = null;

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

export async function GET() {
  const now = Date.now();
  if (
    cachedServerWeather &&
    now - cachedServerWeather.timestamp < CACHE_TTL_MS
  ) {
    return NextResponse.json(cachedServerWeather.data);
  }

  try {
    const lats = SEEDED_HOTSPOTS.map((h) => h.lat.toFixed(4)).join(",");
    const lngs = SEEDED_HOTSPOTS.map((h) => h.lng.toFixed(4)).join(",");

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=rain&hourly=precipitation,precipitation_probability&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FKolkata`;

    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Open-Meteo returned HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const raw = (await res.json()) as
      | OpenMeteoLocationPayload
      | OpenMeteoLocationPayload[];
    const payloads = Array.isArray(raw) ? raw : [raw];
    const istHourPrefix = getCurrentKolkataHourPrefix();
    const fetchedAt = new Date().toISOString();

    const result: Record<string, WeatherSnapshot> = {};

    SEEDED_HOTSPOTS.forEach((hs, idx) => {
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

    cachedServerWeather = { data: result, timestamp: now };
    return NextResponse.json(result);
  } catch {
    if (cachedServerWeather) {
      return NextResponse.json(cachedServerWeather.data);
    }
    return NextResponse.json(
      { error: "Failed to fetch Open-Meteo weather." },
      { status: 502 }
    );
  }
}
