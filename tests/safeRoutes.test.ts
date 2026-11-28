import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUS_ROUTING_DISCLAIMER,
  computeGeometryOverlap,
  computeSafetyScore,
  deduplicateRoutes,
  findSafeRoutes,
  isSupportedVehicle,
  mapVehicleToProfile,
  parseLatLngParam,
  RoutingProviderError,
} from "../lib/safeRoutes";
import type { HazardZone } from "../lib/geo";

describe("Input validation", () => {
  it("parses valid lat,lng strings", () => {
    assert.deepEqual(parseLatLngParam("19.076, 72.8777"), {
      lat: 19.076,
      lng: 72.8777,
    });
    assert.deepEqual(parseLatLngParam("-33.8688,151.2093"), {
      lat: -33.8688,
      lng: 151.2093,
    });
  });

  it("rejects invalid coordinates and out-of-range values", () => {
    assert.equal(parseLatLngParam(null), null);
    assert.equal(parseLatLngParam(""), null);
    assert.equal(parseLatLngParam("19.076"), null);
    assert.equal(parseLatLngParam("abc,72.87"), null);
    assert.equal(parseLatLngParam("91,72.87"), null);
    assert.equal(parseLatLngParam("19.07,181"), null);
  });

  it("validates supported vehicles", () => {
    assert.equal(isSupportedVehicle("bike"), true);
    assert.equal(isSupportedVehicle("car"), true);
    assert.equal(isSupportedVehicle("bus"), true);
    assert.equal(isSupportedVehicle("walk"), true);
    assert.equal(isSupportedVehicle("scooter"), false);
    assert.equal(isSupportedVehicle("train"), false);
  });
});

describe("Vehicle-to-profile mapping", () => {
  it("maps bike, car, bus, walk to OSRM profiles", () => {
    assert.deepEqual(mapVehicleToProfile("bike"), {
      profile: "cycling",
      busDisclaimer: undefined,
    });
    assert.deepEqual(mapVehicleToProfile("car"), {
      profile: "driving",
      busDisclaimer: undefined,
    });
    assert.deepEqual(mapVehicleToProfile("walk"), {
      profile: "foot",
      busDisclaimer: undefined,
    });
    assert.deepEqual(mapVehicleToProfile("bus"), {
      profile: "driving",
      busDisclaimer: BUS_ROUTING_DISCLAIMER,
    });
  });
});

describe("Route de-duplication", () => {
  const baseGeom: [number, number][] = [
    [19.01, 72.84],
    [19.015, 72.845],
    [19.02, 72.85],
    [19.025, 72.855],
  ];

  const nearlyIdenticalGeom: [number, number][] = [
    [19.0101, 72.8401],
    [19.0151, 72.8451],
    [19.0201, 72.8501],
    [19.0251, 72.8551],
  ];

  const distinctGeom: [number, number][] = [
    [19.01, 72.84],
    [19.012, 72.865],
    [19.022, 72.868],
    [19.025, 72.855],
  ];

  it("detects >90% overlap and removes duplicate routes", () => {
    const overlap = computeGeometryOverlap(baseGeom, nearlyIdenticalGeom);
    assert.ok(overlap > 0.9, `Expected >0.9 overlap, got ${overlap}`);

    const deduped = deduplicateRoutes([
      { id: "r1", geometry: baseGeom },
      { id: "r2", geometry: nearlyIdenticalGeom },
      { id: "r3", geometry: distinctGeom },
    ]);

    assert.equal(deduped.length, 2);
    assert.deepEqual(
      deduped.map((r) => r.id),
      ["r1", "r3"]
    );
  });
});

describe("Safety scoring", () => {
  const straightRoute: [number, number][] = [
    [19.01, 72.84],
    [19.015, 72.845],
    [19.02, 72.85],
  ];

  const hazardsOnRoute: HazardZone[] = [
    {
      id: "h1",
      name: "Hindmata",
      lat: 19.015,
      lng: 72.845,
      radiusM: 350,
      severity: "severe",
      hazardType: "urban_waterlogging",
    },
    {
      id: "h2",
      name: "Dadar TT",
      lat: 19.02,
      lng: 72.85,
      radiusM: 350,
      severity: "high",
      hazardType: "urban_waterlogging",
    },
  ];

  it("scores hazard-free route higher than hazard-exposed route", () => {
    const clean = computeSafetyScore({
      coordinates: straightRoute,
      distanceM: 1800,
      durationS: 300,
      vehicle: "car",
      hazardZones: [],
    });

    const risky = computeSafetyScore({
      coordinates: straightRoute,
      distanceM: 1800,
      durationS: 300,
      vehicle: "car",
      hazardZones: hazardsOnRoute,
    });

    assert.ok(clean.safety_score > risky.safety_score);
    assert.equal(clean.hazards_on_route.count, 0);
    assert.equal(risky.hazards_on_route.count, 2);
    assert.ok(risky.safety_score >= 0 && risky.safety_score <= 100);
  });

  it("penalizes highways for bikes", () => {
    const localBike = computeSafetyScore({
      coordinates: straightRoute,
      distanceM: 3000,
      durationS: 600,
      vehicle: "bike",
      hazardZones: [],
      steps: [{ distance: 3000, duration: 600, name: "Link Road" }],
    });

    const highwayBike = computeSafetyScore({
      coordinates: straightRoute,
      distanceM: 3000,
      durationS: 400,
      vehicle: "bike",
      hazardZones: [],
      steps: [{ distance: 3000, duration: 400, name: "Western Express Highway", ref: "NH 48" }],
    });

    assert.ok(localBike.safety_score > highwayBike.safety_score);
  });
});

describe("findSafeRoutes with mocked OSRM provider", () => {
  it("ranks safest route first and labels Safest / Fastest / Balanced", async () => {
    const hazards: HazardZone[] = [
      {
        id: "h1",
        name: "Hindmata",
        lat: 19.015,
        lng: 72.845,
        radiusM: 350,
        severity: "severe",
        hazardType: "urban_waterlogging",
      },
    ];

    const mockFetcher: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              // Fast route passing directly through Hindmata
              distance: 2000,
              duration: 240,
              geometry: {
                coordinates: [
                  [72.84, 19.01],
                  [72.845, 19.015],
                  [72.85, 19.02],
                ],
              },
              legs: [{ steps: [{ distance: 2000, duration: 240, name: "Dr Ambedkar Rd" }] }],
            },
            {
              // Longer eastern bypass avoiding Hindmata
              distance: 3200,
              duration: 420,
              geometry: {
                coordinates: [
                  [72.84, 19.01],
                  [72.86, 19.015],
                  [72.85, 19.02],
                ],
              },
              legs: [{ steps: [{ distance: 3200, duration: 420, name: "Eastern Freeway" }] }],
            },
            {
              // Balanced western route avoiding Hindmata
              distance: 2800,
              duration: 360,
              geometry: {
                coordinates: [
                  [72.84, 19.01],
                  [72.83, 19.015],
                  [72.85, 19.02],
                ],
              },
              legs: [{ steps: [{ distance: 2800, duration: 360, name: "Senapati Bapat Marg" }] }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await findSafeRoutes(
      { lat: 19.01, lng: 72.84 },
      { lat: 19.02, lng: 72.85 },
      "car",
      hazards,
      { fetcher: mockFetcher }
    );

    assert.equal(res.routes.length, 3);
    assert.equal(res.routes[0].label, "Safest");
    assert.ok(res.routes[0].safety_score >= res.routes[1].safety_score);
    assert.ok(res.routes[1].safety_score >= res.routes[2].safety_score);
    assert.equal(res.routes[2].hazards_on_route.count, 1);
    assert.equal(res.routes[2].label, "Fastest");
    assert.equal(res.routes[1].label, "Balanced");
  });

  it("handles OSRM rate-limit (429) gracefully", async () => {
    const rateLimitedFetcher: typeof fetch = async () =>
      new Response("Too Many Requests", { status: 429 });

    await assert.rejects(
      () =>
        findSafeRoutes(
          { lat: 19.01, lng: 72.84 },
          { lat: 19.02, lng: 72.85 },
          "bike",
          [],
          { fetcher: rateLimitedFetcher }
        ),
      (err: unknown) =>
        err instanceof RoutingProviderError && err.status === 429
    );
  });
});
