import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimitStore } from "@/lib/security";

interface MockSub {
  id: string;
  email: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  verified: boolean;
  confirmToken: string;
  unsubscribeToken: string;
}

const mockSubs: MockSub[] = [];
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        if (where.email) return mockSubs.find((s) => s.email === where.email) ?? null;
        if (where.confirmToken)
          return mockSubs.find((s) => s.confirmToken === where.confirmToken) ?? null;
        if (where.unsubscribeToken)
          return mockSubs.find((s) => s.unsubscribeToken === where.unsubscribeToken) ?? null;
        return null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { email: string };
          create: Omit<MockSub, "id">;
          update: Partial<MockSub>;
        }) => {
          const existing = mockSubs.find((s) => s.email === where.email);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const created: MockSub = { id: `sub-${mockSubs.length + 1}`, ...create };
          mockSubs.push(created);
          return created;
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockSub>;
        }) => {
          const found = mockSubs.find((s) => s.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = mockSubs.findIndex((s) => s.id === where.id);
        if (idx >= 0) mockSubs.splice(idx, 1);
      }),
      findMany: vi.fn(async ({ where }: { where?: { verified?: boolean } }) => {
        if (where?.verified !== undefined) {
          return mockSubs.filter((s) => s.verified === where.verified);
        }
        return mockSubs;
      }),
    },
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: vi.fn(async (msg: { to: string; subject: string; text: string }) => {
    sentEmails.push(msg);
    return { delivered: true, provider: "console" };
  }),
}));

import { POST as subscribe } from "@/app/api/alerts/subscribe/route";
import { GET as confirm } from "@/app/api/alerts/confirm/route";
import { GET as unsubscribe } from "@/app/api/alerts/unsubscribe/route";
import { notifySubscribersForReport } from "@/lib/alerts-service";
import type { PublicReportDTO } from "@/lib/reports-service";

describe("Feature 2: Email Alerts", () => {
  beforeEach(() => {
    mockSubs.length = 0;
    sentEmails.length = 0;
    clearRateLimitStore();
  });

  it("subscribes, confirms, triggers alert for matching high-severity report, and unsubscribes", async () => {
    const subReq = new NextRequest("http://localhost:3000/api/alerts/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
      body: JSON.stringify({ email: "  User@Example.COM ", district: "Mumbai" }),
    });
    const subRes = await subscribe(subReq);
    expect(subRes.status).toBe(201);
    expect(mockSubs).toHaveLength(1);
    expect(mockSubs[0].email).toBe("user@example.com");
    expect(mockSubs[0].verified).toBe(false);
    expect(sentEmails).toHaveLength(1);

    // Confirm
    const confirmReq = new NextRequest(
      `http://localhost:3000/api/alerts/confirm?token=${mockSubs[0].confirmToken}`
    );
    const confirmRes = await confirm(confirmReq);
    expect(confirmRes.status).toBe(200);
    expect(mockSubs[0].verified).toBe(true);

    // Trigger report in Mumbai (high severity)
    const report: PublicReportDTO = {
      id: "rep-1",
      type: "waterlogging",
      description: "Heavy flooding near Dadar",
      latitude: 19.0178,
      longitude: 72.8478,
      severity: "high",
      imageUrl: null,
      status: "active",
      waterPresent: true,
      verified: true,
      demoMode: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lat: 19.0178,
      lng: 72.8478,
      reason: "Heavy flooding near Dadar",
    };

    const count = await notifySubscribersForReport(report);
    expect(count).toBe(1);
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[1].text).toContain("unsubscribe");

    // Unsubscribe
    const unsubReq = new NextRequest(
      `http://localhost:3000/api/alerts/unsubscribe?token=${mockSubs[0].unsubscribeToken}`
    );
    const unsubRes = await unsubscribe(unsubReq);
    expect(unsubRes.status).toBe(200);
    expect(mockSubs).toHaveLength(0);
  });

  it("does not notify subscribers for low-severity reports", async () => {
    mockSubs.push({
      id: "sub-1",
      email: "a@b.com",
      district: null,
      latitude: null,
      longitude: null,
      radiusKm: 25,
      verified: true,
      confirmToken: "c1",
      unsubscribeToken: "u1",
    });

    const lowReport: PublicReportDTO = {
      id: "rep-2",
      type: "waterlogging",
      description: "Minor puddle",
      latitude: 19.0,
      longitude: 72.8,
      severity: "low",
      imageUrl: null,
      status: "active",
      waterPresent: true,
      verified: true,
      demoMode: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lat: 19.0,
      lng: 72.8,
      reason: "Minor puddle",
    };

    const count = await notifySubscribersForReport(lowReport);
    expect(count).toBe(0);
    expect(sentEmails).toHaveLength(0);
  });
});
