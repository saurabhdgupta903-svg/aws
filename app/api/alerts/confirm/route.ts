import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing confirmation token." },
      { status: 400 }
    );
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { confirmToken: token },
    });

    if (!sub) {
      return NextResponse.json(
        { error: "Invalid or expired confirmation token." },
        { status: 404 }
      );
    }

    if (!sub.verified) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { verified: true },
      });
    }

    return NextResponse.json({
      confirmed: true,
      email: sub.email,
      district: sub.district,
      message: "Your FloodLoop email alert subscription is now verified.",
    });
  } catch (err) {
    console.error(
      "[GET /api/alerts/confirm] Error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Failed to confirm subscription." },
      { status: 500 }
    );
  }
}
