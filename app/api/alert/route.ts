import { NextRequest, NextResponse } from "next/server";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes per hotspot
const lastAlertSent = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      hotspotId?: string;
      hotspotName?: string;
      city?: string;
      score?: number;
      level?: string;
    };

    const topicArn = process.env.SNS_TOPIC_ARN?.trim();
    if (!topicArn) {
      return NextResponse.json({ published: false, demoMode: true });
    }

    if (body.level !== "high" && body.level !== "severe") {
      return NextResponse.json({ published: false, skipped: "low-or-medium" });
    }

    const key = body.hotspotId || body.hotspotName || "maharashtra";
    const now = Date.now();
    const prev = lastAlertSent.get(key) ?? 0;
    if (now - prev < COOLDOWN_MS) {
      return NextResponse.json({ published: false, skipped: "cooldown" });
    }

    const region = process.env.AWS_REGION?.trim() || "ap-south-1";
    const sns = new SNSClient({ region });
    await sns.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: `FloodLoop AI Alert: ${String(body.level).toUpperCase()} risk in ${
          body.city || "Maharashtra"
        }`,
        Message: `FloodLoop AI detected ${String(
          body.level
        ).toUpperCase()} flood risk (${body.score ?? "-"}/100) at ${
          body.hotspotName || "hotspot"
        }, ${body.city || "Maharashtra"}. Avoid low-lying roads and check safe routes in FloodLoop AI.`,
      })
    );

    lastAlertSent.set(key, now);
    return NextResponse.json({ published: true, demoMode: false });
  } catch {
    return NextResponse.json({ published: false, error: "SNS publish failed" });
  }
}
