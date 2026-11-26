import { NextRequest, NextResponse } from "next/server";
import { SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email?.trim() ?? "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const topicArn = process.env.SNS_TOPIC_ARN?.trim();
    if (!topicArn) {
      return NextResponse.json({
        subscribed: true,
        demoMode: true,
        message: "Demo mode: SNS_TOPIC_ARN not configured; alert preference noted.",
      });
    }

    const region = process.env.AWS_REGION?.trim() || "ap-south-1";
    const sns = new SNSClient({ region });
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "email",
        Endpoint: email,
      })
    );

    return NextResponse.json({
      subscribed: true,
      demoMode: false,
      message: "Confirmation email sent via Amazon SNS. Please check your inbox.",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to subscribe to SNS flood alerts." },
      { status: 500 }
    );
  }
}
