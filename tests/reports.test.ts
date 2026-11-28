import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

// Configure an isolated test database before importing Prisma / route handlers
const TEST_DB_PATH = path.resolve(process.cwd(), "prisma", "test.db");
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.ALLOWED_ORIGINS = "http://localhost:3000,https://example.com";

import { NextRequest } from "next/server";
import { GET as getReportByIdHandler } from "../app/api/reports/[id]/route";
import {
  GET as listReportsHandler,
  OPTIONS as optionsReportsHandler,
  POST as createReportHandler,
} from "../app/api/reports/route";
import { prisma } from "../lib/db";
import { resetRateLimitStore } from "../lib/reportSecurity";

function makeJsonPost(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: payload,
  });
}

function makeGet(query = "", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000/api/reports${query}`, {
    method: "GET",
    headers,
  });
}

describe("Reports API (/api/reports)", () => {
  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
      stdio: "pipe",
    });
  });

  beforeEach(async () => {
    resetRateLimitStore();
    await prisma.report.deleteMany();
  });

  after(async () => {
    await prisma.$disconnect();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it("creates a report with valid input and returns 201", async () => {
    const req = makeJsonPost({
      title: "<b>Kurla</b> Waterlogging",
      type: "waterlogging",
      description: "<script>alert(1)</script>Knee-deep water near station.",
      latitude: 19.065,
      longitude: 72.879,
      severity: "high",
      waterPresent: true,
    });

    const res = await createReportHandler(req);
    assert.equal(res.status, 201);

    const data = (await res.json()) as {
      report: {
        id: string;
        title: string;
        type: string;
        description: string;
        latitude: number;
        longitude: number;
        severity: string;
        status: string;
        verified: boolean;
      };
    };

    assert.ok(data.report.id);
    assert.equal(data.report.title, "Kurla Waterlogging");
    assert.equal(data.report.type, "waterlogging");
    assert.equal(data.report.description, "Knee-deep water near station.");
    assert.equal(data.report.latitude, 19.065);
    assert.equal(data.report.longitude, 72.879);
    assert.equal(data.report.severity, "high");
    assert.equal(data.report.status, "active");
    assert.equal(data.report.verified, true);
  });

  it("rejects invalid coordinates, missing description, and invalid image types", async () => {
    const badCoords = await createReportHandler(
      makeJsonPost({
        description: "Flooded road",
        latitude: 120,
        longitude: 72.8,
      })
    );
    assert.equal(badCoords.status, 400);

    const missingDesc = await createReportHandler(
      makeJsonPost({
        latitude: 19.07,
        longitude: 72.87,
      })
    );
    assert.equal(missingDesc.status, 400);

    const badImage = await createReportHandler(
      makeJsonPost({
        description: "Flooded road",
        latitude: 19.07,
        longitude: 72.87,
        imageUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      })
    );
    assert.equal(badImage.status, 400);

    const oversized = await createReportHandler(
      makeJsonPost({
        description: "x".repeat(110_000),
        latitude: 19.07,
        longitude: 72.87,
      })
    );
    assert.equal(oversized.status, 413);
  });

  it("lists reports publicly without auth, sorted newest first with pagination and filters", async () => {
    await prisma.report.createMany({
      data: [
        {
          id: "r-old",
          title: "Old Pune Report",
          type: "flood",
          description: "Older report in Pune",
          latitude: 18.52,
          longitude: 73.85,
          severity: "low",
          status: "resolved",
          createdAt: new Date("2026-01-01T10:00:00Z"),
        },
        {
          id: "r-mid",
          title: "Mumbai Waterlogging",
          type: "waterlogging",
          description: "Waterlogging in Dadar",
          latitude: 19.017,
          longitude: 72.847,
          severity: "high",
          status: "active",
          createdAt: new Date("2026-01-02T10:00:00Z"),
        },
        {
          id: "r-new",
          title: "Mumbai Drain",
          type: "drain_overflow",
          description: "Drain overflow in Bandra",
          latitude: 19.054,
          longitude: 72.84,
          severity: "medium",
          status: "active",
          createdAt: new Date("2026-01-03T10:00:00Z"),
        },
      ],
    });

    // Public GET without Authorization header + pagination
    const page1Res = await listReportsHandler(makeGet("?limit=2&offset=0"));
    assert.equal(page1Res.status, 200);
    const page1 = (await page1Res.json()) as {
      reports: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(page1.total, 3);
    assert.equal(page1.hasMore, true);
    assert.deepEqual(
      page1.reports.map((r) => r.id),
      ["r-new", "r-mid"]
    );

    // Filter by status & type
    const filteredRes = await listReportsHandler(
      makeGet("?status=active&type=waterlogging")
    );
    assert.equal(filteredRes.status, 200);
    const filtered = (await filteredRes.json()) as {
      reports: Array<{ id: string }>;
      total: number;
    };
    assert.equal(filtered.total, 1);
    assert.equal(filtered.reports[0].id, "r-mid");

    // Bounding box filter around Mumbai
    const bboxRes = await listReportsHandler(
      makeGet("?min_lat=18.9&max_lat=19.2&min_lng=72.7&max_lng=73.0")
    );
    assert.equal(bboxRes.status, 200);
    const bbox = (await bboxRes.json()) as {
      reports: Array<{ id: string }>;
      total: number;
    };
    assert.equal(bbox.total, 2);
    assert.deepEqual(
      bbox.reports.map((r) => r.id),
      ["r-new", "r-mid"]
    );

    // Radius filter around Dadar (10 km)
    const radiusRes = await listReportsHandler(
      makeGet("?lat=19.017&lng=72.847&radius_km=10")
    );
    assert.equal(radiusRes.status, 200);
    const radius = (await radiusRes.json()) as {
      reports: Array<{ id: string }>;
      total: number;
    };
    assert.equal(radius.total, 2);
  });

  it("gets a report by id and returns 404 when missing", async () => {
    const created = await prisma.report.create({
      data: {
        id: "rep-lookup-1",
        type: "flood",
        description: "Bridge submerged",
        latitude: 19.1,
        longitude: 72.9,
        severity: "severe",
      },
    });

    const foundRes = await getReportByIdHandler(makeGet(), {
      params: Promise.resolve({ id: created.id }),
    });
    assert.equal(foundRes.status, 200);
    const found = (await foundRes.json()) as { report: { id: string } };
    assert.equal(found.report.id, created.id);

    const missingRes = await getReportByIdHandler(makeGet(), {
      params: Promise.resolve({ id: "non-existent-id" }),
    });
    assert.equal(missingRes.status, 404);
  });

  it("enforces CORS allowed origins", async () => {
    const allowedRes = await listReportsHandler(
      makeGet("", { origin: "https://example.com" })
    );
    assert.equal(
      allowedRes.headers.get("access-control-allow-origin"),
      "https://example.com"
    );

    const blockedPreflight = await optionsReportsHandler(
      new NextRequest("http://localhost:3000/api/reports", {
        method: "OPTIONS",
        headers: { origin: "https://evil.invalid" },
      })
    );
    assert.equal(blockedPreflight.status, 403);
  });
});
