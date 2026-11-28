import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toPublicReport } from "@/lib/reports-service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cleanId = id?.trim();
    if (!cleanId || cleanId.length > 100) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const report = await prisma.report.findUnique({
      where: { id: cleanId },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({ report: toPublicReport(report) });
  } catch (err) {
    console.error("[GET /api/reports/[id]] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Failed to fetch report." },
      { status: 500 }
    );
  }
}
