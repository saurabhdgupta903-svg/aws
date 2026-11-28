import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited, sanitizeText } from "@/lib/security";
import {
  buildConfirmationEmail,
  resolveDistrictCoords,
} from "@/lib/alerts-service";
import { sendEmail } from "@/lib/mailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`subscribe:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many subscription requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as {
      email?: unknown;
      district?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      radiusKm?: unknown;
    };

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const district =
      typeof body.district === "string" && sanitizeText(body.district, 80)
        ? sanitizeText(body.district, 80)
        : null;

    let latitude =
      typeof body.latitude === "number" &&
      Number.isFinite(body.latitude) &&
      body.latitude >= -90 &&
      body.latitude <= 90
        ? body.latitude
        : null;
    let longitude =
      typeof body.longitude === "number" &&
      Number.isFinite(body.longitude) &&
      body.longitude >= -180 &&
      body.longitude <= 180
        ? body.longitude
        : null;

    if (latitude === null && longitude === null && district) {
      const coords = resolveDistrictCoords(district);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }

    const radiusKm =
      typeof body.radiusKm === "number" &&
      Number.isFinite(body.radiusKm) &&
      body.radiusKm >= 1 &&
      body.radiusKm <= 200
        ? body.radiusKm
        : 25;

    const existing = await prisma.subscription.findUnique({
      where: { email },
    });

    if (existing?.verified) {
      return NextResponse.json(
        {
          subscribed: true,
          alreadyVerified: true,
          message: "This email is already subscribed and verified for flood alerts.",
        },
        { status: 200 }
      );
    }

    const confirmToken = randomBytes(24).toString("hex");
    const unsubscribeToken =
      existing?.unsubscribeToken ?? randomBytes(24).toString("hex");

    const sub = await prisma.subscription.upsert({
      where: { email },
      update: {
        district,
        latitude,
        longitude,
        radiusKm,
        confirmToken,
      },
      create: {
        email,
        district,
        latitude,
        longitude,
        radiusKm,
        verified: false,
        confirmToken,
        unsubscribeToken,
      },
    });

    const emailMsg = buildConfirmationEmail(
      sub.email,
      sub.confirmToken,
      sub.unsubscribeToken,
      sub.district
    );
    const sendRes = await sendEmail(emailMsg);

    return NextResponse.json(
      {
        subscribed: true,
        verified: false,
        provider: sendRes.provider,
        message:
          sendRes.provider === "console"
            ? "Confirmation link logged to server console (local dev mode)."
            : "Confirmation email sent. Please check your inbox to verify.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(
      "[POST /api/alerts/subscribe] Error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Failed to subscribe for flood alerts." },
      { status: 500 }
    );
  }
}
