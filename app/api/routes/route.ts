import { NextRequest, NextResponse } from "next/server";
import {
  planVehicleSafeRoutes,
  VALID_VEHICLES,
  type VehicleType,
} from "@/lib/routes-service";

function parseLatLng(param: string | null): { lat: number; lng: number } | null {
  if (!param) return null;
  const parts = param.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2) return null;
  const [lat, lng] = parts;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = parseLatLng(sp.get("from"));
  const to = parseLatLng(sp.get("to"));

  if (!from || !to) {
    return NextResponse.json(
      { error: "Valid 'from=lat,lng' and 'to=lat,lng' query parameters are required." },
      { status: 400 }
    );
  }

  const rawVehicle = (sp.get("vehicle")?.trim().toLowerCase() || "car") as VehicleType;
  if (!VALID_VEHICLES.includes(rawVehicle)) {
    return NextResponse.json(
      { error: `Invalid vehicle. Allowed: ${VALID_VEHICLES.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const result = await planVehicleSafeRoutes(from, to, rawVehicle);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Routing provider error.";
    const isNoRoute = message.toLowerCase().includes("no route");
    return NextResponse.json(
      { error: message },
      { status: isNoRoute ? 404 : 502 }
    );
  }
}
