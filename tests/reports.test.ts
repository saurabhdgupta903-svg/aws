import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimitStore } from "@/lib/security";

// Mock Prisma client
const mockReports: Array<Record<string, unknown>> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const created = {
          id: `rep-${mockReports.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        mockReports.unshift(created);
        return created;
      }),
      findMany: vi.fn(
        async ({
          where,
          take,
          skip,
        }: {
          where?: Record<string, unknown>;
          take?: number;
          skip?: number;
        }) => {
          let filtered = [...mockReports];
          if (where?.type) {
            filtered = filtered.filter((r) => r.type === where.type);
          }
          if (where?.status) {
            filtered = filtered.filter((r) => r.status === where.status);
          }
          const start = skip ?? 0;
          const end = start + (take ?? 50);
          return filtered.slice(start, end);
        }
      ),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        let filtered = [...mockReports];
        if (where?.type) {
          filtered = filtered.filter((r) => r.type === where.type);
        }
        if (where?.status) {
          filtered = filtered.filter((r) => r.status === where.status);
        }
        return filtered.length;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockReports.find((r) => r.id === where.id) ?? null;
      }),
    },
  },
}));

import { GET as getReports, POST as createReport } from "@/app/api/reports/route";
import { GET as getReportById } from "@/app/api/reports/[id]/route";

describe("Feature 1: /api/reports", () => {
  beforeEach(() => {
    mockReports.length = 0;
    clearRateLimitStore();
  });

  it("creates a report (201), sanitizes HTML/script, and lists it publicly without auth", async () => {
    const req = new NextRequest("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({
        type: "waterlogging",
        description: "<script>alert(1)</script>Waterlogging near Dadar TT",
        latitude: 19.0178,
        longitude: 72.8478,
        severity: "high",
      }),
    });

    const postRes = await createReport(req);
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();
    expect(postJson.report.description).toBe("alert(1)Waterlogging near Dadar TT");
    expect(postJson.report.description).not.toContain("<script>");
    expect(postJson.report.status).toBe("active");

    // Public GET without auth
    const getReq = new NextRequest("http://localhost:3000/api/reports?type=waterlogging&limit=10");
    const getRes = await getReports(getReq);
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.reports).toHaveLength(1);
    expect(getJson.total).toBe(1);
  });

  it("validates coordinates and returns 400 on out-of-range lat/lng", async () => {
    const req = new NextRequest("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.5" },
      body: JSON.stringify({
        type: "waterlogging",
        description: "Test",
        latitude: 120,
        longitude: 72.8,
      }),
    });
    const res = await createReport(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when report id is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/reports/nonexistent");
    const res = await getReportById(req, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});
