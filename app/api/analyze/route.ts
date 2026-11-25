import { NextRequest, NextResponse } from "next/server";

type Severity = "low" | "medium" | "high" | "severe";

interface AnalyzeResponse {
  waterPresent: boolean;
  severity: Severity;
  reason: string;
  demoMode: boolean;
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
  const scenarios: Array<Omit<AnalyzeResponse, "demoMode">> = [
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
  return { ...pick, demoMode: true };
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
    let base64Data = "";
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

      const buffer = Buffer.from(await file.arrayBuffer());
      base64Data = buffer.toString("base64");
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
      base64Data = body.imageBase64.replace(/^data:[^;]+;base64,/, "");
      if (Buffer.byteLength(base64Data, "base64") > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds 4MB size limit." },
          { status: 413 }
        );
      }
      seed = `${base64Data.length}-${Date.now() % 4}`;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(mockAnalysis(seed));
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const prompt =
      'Analyze this street or highway photo in Maharashtra for waterlogging, river flooding, or landslide debris. Return ONLY valid JSON with keys: {"waterPresent": boolean, "severity": "low"|"medium"|"high"|"severe", "reason": string}. Keep reason under 25 words.';

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!geminiRes.ok) {
      return NextResponse.json(mockAnalysis(seed));
    }

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(rawText) as Partial<AnalyzeResponse>;

    const severity: Severity = VALID_SEVERITIES.includes(
      parsed.severity as Severity
    )
      ? (parsed.severity as Severity)
      : "medium";

    return NextResponse.json({
      waterPresent: Boolean(parsed.waterPresent),
      severity,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : "Analyzed street condition for surface water.",
      demoMode: false,
    } satisfies AnalyzeResponse);
  } catch {
    return NextResponse.json(mockAnalysis("fallback"));
  }
}
