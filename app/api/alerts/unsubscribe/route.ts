import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing unsubscribe token." },
      { status: 400 }
    );
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!sub) {
      return NextResponse.json(
        { error: "Invalid or already unsubscribed token." },
        { status: 404 }
      );
    }

    await prisma.subscription.delete({
      where: { id: sub.id },
    });

    return NextResponse.json({
      unsubscribed: true,
      message: "You have been unsubscribed from FloodLoop alerts.",
    });
  } catch (err) {
    console.error(
      "[GET /api/alerts/unsubscribe] Error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Failed to unsubscribe." },
      { status: 500 }
    );
  }
}
