import { NextRequest } from "next/server";
import { handleChatRequest } from "@/lib/chatHandler";
import { handleCorsPreflight } from "@/lib/reportSecurity";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req);
}

export async function POST(req: NextRequest) {
  return handleChatRequest(req);
}
