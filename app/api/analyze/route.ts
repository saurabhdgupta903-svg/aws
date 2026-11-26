import { NextRequest, NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  RekognitionClient,
  DetectLabelsCommand,
  type Label,
} from "@aws-sdk/client-rekognition";

type Severity = "low" | "medium" | "high" | "severe";
type AnalyzeProvider = "bedrock" | "rekognition" | "mock";

interface AnalyzeResponse {
  waterPresent: boolean;
  severity: Severity;
  reason: string;
  demoMode: boolean;
  provider?: AnalyzeProvider;
}

const VALID_SEVERITIES: Severity[] = ["low", "medium", "high", "severe"];
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 10;

const ipBuckets = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipBuckets.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  ipBuckets.set(ip, timestamps);
  return false;
}

function mockAnalysis(seedText: string): AnalyzeResponse {
  const hash = Array.from(seedText).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
    7
  );
  const scenarios: Array<Omit<AnalyzeResponse, "demoMode" | "provider">> = [
    {
      waterPresent: true,
      severity: "high",
      reason:
        "Standing muddy rainwater covers the roadway up to curb/wheel-rim level, slowing traffic.",
    },
    {
      waterPresent: true,
      severity: "severe",
      reason:
        "Deep waterlogging visible across lanes near underpass; unsafe for hatchbacks and two-wheelers.",
    },
    {
      waterPresent: true,
      severity: "medium",
      reason:
        "Moderate surface water accumulation along roadside drain; passable with caution.",
    },
    {
      waterPresent: false,
      severity: "low",
      reason:
        "No flooding visible; road surface appears wet from rain but clear for normal traffic.",
    },
  ];
  const pick = scenarios[hash % scenarios.length];
  return { ...pick, demoMode: true, provider: "mock" };
}

function parseValidatedJson(rawText: string): Omit<AnalyzeResponse, "demoMode" | "provider"> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  if (typeof parsed.waterPresent !== "boolean") {
    throw new Error("Invalid Bedrock JSON: missing boolean waterPresent");
  }
  const severity = VALID_SEVERITIES.includes(parsed.severity as Severity)
    ? (parsed.severity as Severity)
    : null;
  if (!severity) {
    throw new Error("Invalid Bedrock JSON: invalid severity");
  }
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 220)
      : "Analyzed street condition.";

  return { waterPresent: parsed.waterPresent, severity, reason };
}

async function analyzeWithBedrock(
  bytes: Uint8Array,
  mimeType: string
): Promise<AnalyzeResponse> {
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const modelId =
    process.env.BEDROCK_MODEL_ID?.trim() || "amazon.nova-lite-v1:0";

  const format = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpeg";

  const client = new BedrockRuntimeClient({ region });
  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: "user",
        content: [
          {
            text: 'Analyze this street photo in Maharashtra for waterlogging or flooding. Return ONLY raw JSON with keys: {"waterPresent": boolean, "severity": "low"|"medium"|"high"|"severe", "reason": string}. Keep reason under 25 words.',
          },
          {
            image: {
              format,
              source: { bytes },
            },
          },
        ],
      },
    ],
    inferenceConfig: {
      temperature: 0.1,
      maxTokens: 200,
    },
  });

  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find(
    (c) => typeof c.text === "string"
  );
  if (!textBlock?.text) {
    throw new Error("Empty Bedrock response");
  }

  const validated = parseValidatedJson(textBlock.text);
  return { ...validated, demoMode: false, provider: "bedrock" };
}

/**
 * Derive flood presence and severity from Amazon Rekognition DetectLabels:
 * - Flood >= 75% confidence -> waterPresent: true, severity: "severe" (if Vehicle/Car/Person also present) or "high"
 * - Water / Body of Water / River >= 70% with Road/Street/Car/Person -> waterPresent: true, severity: "high"
 * - Puddle >= 65% -> waterPresent: true, severity: "medium"
 * - Otherwise -> waterPresent: false, severity: "low" ("No flooding visible")
 */
function mapRekognitionLabels(
  labels: Label[]
): Omit<AnalyzeResponse, "demoMode" | "provider"> {
  const conf = (name: string) =>
    labels.find((l) => l.Name?.toLowerCase() === name.toLowerCase())
      ?.Confidence ?? 0;

  const floodConf = conf("Flood");
  const waterConf = Math.max(
    conf("Water"),
    conf("Body of Water"),
    conf("River")
  );
  const puddleConf = conf("Puddle");
  const hasTrafficOrPeople =
    Math.max(conf("Car"), conf("Vehicle"), conf("Person")) >= 65;
  const hasRoad = Math.max(conf("Road"), conf("Street")) >= 60;

  if (floodConf >= 75) {
    return {
      waterPresent: true,
      severity: hasTrafficOrPeople ? "severe" : "high",
      reason: `Rekognition detected Flood (${Math.round(
        floodConf
      )}% confidence)${
        hasTrafficOrPeople ? " affecting nearby vehicles/pedestrians" : ""
      }.`,
    };
  }

  if (waterConf >= 70 && (hasRoad || hasTrafficOrPeople)) {
    return {
      waterPresent: true,
      severity: hasTrafficOrPeople ? "high" : "medium",
      reason: `Rekognition detected standing Water (${Math.round(
        waterConf
      )}% confidence) on roadway.`,
    };
  }

  if (puddleConf >= 65) {
    return {
      waterPresent: true,
      severity: "medium",
      reason: `Rekognition detected Puddle (${Math.round(
        puddleConf
      )}% confidence) along street surface.`,
    };
  }

  return {
    waterPresent: false,
    severity: "low",
    reason: "No flooding visible in Rekognition label analysis.",
  };
}

async function analyzeWithRekognition(
  bytes: Uint8Array
): Promise<AnalyzeResponse> {
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const client = new RekognitionClient({ region });
  const command = new DetectLabelsCommand({
    Image: { Bytes: bytes },
    MaxLabels: 20,
    MinConfidence: 60,
  });
  const res = await client.send(command);
  const mapped = mapRekognitionLabels(res.Labels ?? []);
  return { ...mapped, demoMode: false, provider: "rekognition" };
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded (max 10 analyses per 10 minutes)." },
      { status: 429 }
    );
  }

  try {
    let bytes: Uint8Array;
    let mimeType = "image/jpeg";
    let seed = "flood-report";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing image file in form field 'image'." },
          { status: 400 }
        );
      }
      if (!file.type || !file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "Invalid file type. Only image/* files are accepted." },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds 4MB size limit." },
          { status: 413 }
        );
      }
      bytes = new Uint8Array(await file.arrayBuffer());
      mimeType = file.type;
      seed = `${file.name}-${file.size}-${Date.now() % 4}`;
    } else {
      const body = (await req.json()) as {
        imageBase64?: string;
        mimeType?: string;
      };
      if (!body.imageBase64) {
        return NextResponse.json(
          { error: "Missing imageBase64 payload." },
          { status: 400 }
        );
      }
      mimeType = body.mimeType || "image/jpeg";
      if (!mimeType.startsWith("image/")) {
        return NextResponse.json(
          { error: "Invalid mimeType. Only image/* is accepted." },
          { status: 400 }
        );
      }
      const b64 = body.imageBase64.replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      if (buf.byteLength > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds 4MB size limit." },
          { status: 413 }
        );
      }
      bytes = new Uint8Array(buf);
      seed = `${buf.byteLength}-${Date.now() % 4}`;
    }

    const provider = (process.env.ANALYZE_PROVIDER?.trim().toLowerCase() ||
      "mock") as AnalyzeProvider;

    if (provider === "bedrock") {
      try {
        return NextResponse.json(await analyzeWithBedrock(bytes, mimeType));
      } catch {
        return NextResponse.json(mockAnalysis(seed));
      }
    }

    if (provider === "rekognition") {
      try {
        return NextResponse.json(await analyzeWithRekognition(bytes));
      } catch {
        return NextResponse.json(mockAnalysis(seed));
      }
    }

    return NextResponse.json(mockAnalysis(seed));
  } catch {
    return NextResponse.json(mockAnalysis("fallback"));
  }
}
