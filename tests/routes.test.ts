import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  deduplicateRoutes,
  scoreRouteSafety,
  type ActiveHazardReport,
  type RawProviderRoute,
} from "@/lib/routes-service";
import { GET as getRoutes } from "@/app/api/routes/route";

describe("Feature 3: Safe Routes by Vehicle", () => {
  it("validates query parameters and returns 400 for invalid coords or vehicle", async () => {
    const badCoords = await getRoutes(
      new NextRequest("http://localhost:3000/api/routes?from=bad&to=19.1,72.8")
    );
    expect(badCoords.status).toBe(400);

    const badVehicle = await getRoutes(
      new NextRequest("http://localhost:3000/api/routes?from=19.0,72.8&to=19.1,72.9&vehicle=plane")
    );
    expect(badVehicle.status).toBe(400);
  });

  it("de-duplicates routes with >90% geometric overlap", () => {
    const geomA: [number, number][] = [
      [19.0, 72.8],
      [19.01, 72.81],
      [19.02, 72.82],
    ];
    const geomB: [number, number][] = [
      [19.0, 72.8],
      [19.01, 72.81],
      [19.02, 72.82],
    ];
    const geomC: [number, number][] = [
      [19.0, 72.8],
      [19.05, 72.85],
      [19.02, 72.82],
    ];

    const routes: RawProviderRoute[] = [
      { distanceM: 3000, durationS: 300, geometry: geomA, roadClasses: [] },
      { distanceM: 3050, durationS: 310, geometry: geomB, roadClasses: [] },
      { distanceM: 4200, durationS: 420, geometry: geomC, roadClasses: [] },
    ];

    const deduped = deduplicateRoutes(routes);
    expect(deduped).toHaveLength(2);
  });

  it("scores route safety 0-100 using active hazards and vehicle road-type penalties", () => {
    const route: RawProviderRoute = {
      distanceM: 2500,
      durationS: 300,
      geometry: [
        [19.0, 72.8],
        [19.01, 72.81],
      ],
      roadClasses: ["Western Express Highway"],
    };

    const hazards: ActiveHazardReport[] = [
      {
        id: "h1",
        type: "waterlogging",
        severity: "severe",
        description: "Deep water",
        latitude: 19.005,
        longitude: 72.805,
      },
    ];

    const bikeScore = scoreRouteSafety(route, "bike", hazards);
    const carScore = scoreRouteSafety(route, "car", hazards);

    expect(bikeScore.hazardsOnRoute.count).toBe(1);
    expect(carScore.hazardsOnRoute.count).toBe(1);
    // Bike gets additional highway penalty compared to car
    expect(bikeScore.safetyScore).toBeLessThan(carScore.safetyScore);
    expect(bikeScore.safetyScore).toBeGreaterThanOrEqual(0);
    expect(bikeScore.safetyScore).toBeLessThanOrEqual(100);
  });
});
