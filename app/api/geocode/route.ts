import { NextRequest, NextResponse } from "next/server";

interface GeocodeItem {
  displayName: string;
  lat: number;
  lng: number;
}

const MAHARASHTRA_VIEWBOX = "72.6,22.1,80.9,15.6";
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { items: GeocodeItem[]; ts: number }>();
let lastNominatimCallMs = 0;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.items);
  }

  // Enforce 1 req/sec Nominatim throttle
  const now = Date.now();
  const elapsed = now - lastNominatimCallMs;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  lastNominatimCallMs = Date.now();

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("viewbox", MAHARASHTRA_VIEWBOX);
    url.searchParams.set("bounded", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "FloodLoopAI/2.0 (Maharashtra-Flood-Watch)",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Nominatim error (${res.status})` },
        { status: 502 }
      );
    }

    const raw = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    const items: GeocodeItem[] = raw.map((item) => ({
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));

    cache.set(key, { items, ts: Date.now() });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Nominatim geocoding service." },
      { status: 502 }
    );
  }
}
