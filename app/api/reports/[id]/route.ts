import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, handleCorsPreflight } from "../../../../lib/reportSecurity";
import { getReportById } from "../../../../lib/reportsService";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cleanId = id?.trim();
    if (!cleanId || cleanId.length > 128) {
      return applyCorsHeaders(
        req,
        NextResponse.json({ error: "Invalid report id." }, { status: 400 })
      );
    }

    const report = await getReportById(cleanId);
    if (!report) {
      return applyCorsHeaders(
        req,
        NextResponse.json({ error: "Report not found." }, { status: 404 })
      );
    }

    return applyCorsHeaders(req, NextResponse.json({ report }, { status: 200 }));
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { error: "Failed to fetch report." },
        { status: 500 }
      )
    );
  }
}
