export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmGenerateOptions {
  systemPrompt: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}

export class LlmError extends Error {
  readonly code: "CONFIG" | "TIMEOUT" | "RATE_LIMIT" | "PROVIDER";

  constructor(
    code: "CONFIG" | "TIMEOUT" | "RATE_LIMIT" | "PROVIDER",
    message: string
  ) {
    super(message);
    this.name = "LlmError";
    this.code = code;
  }
}

export type LlmGenerator = (opts: LlmGenerateOptions) => Promise<string>;

const DEFAULT_TIMEOUT_MS = 15_000;

async function callGemini(opts: LlmGenerateOptions): Promise<string> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmError("CONFIG", "LLM_API_KEY is not configured.");
  }

  const model = process.env.LLM_MODEL?.trim() || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: opts.systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 450,
        },
      }),
    });

    if (res.status === 429) {
      throw new LlmError("RATE_LIMIT", "LLM provider quota or rate limit exceeded.");
    }

    if (!res.ok) {
      throw new LlmError("PROVIDER", `LLM provider returned status ${res.status}.`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    if (!text) {
      throw new LlmError("PROVIDER", "LLM provider returned an empty response.");
    }

    return text;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError("TIMEOUT", "LLM request timed out.");
    }
    throw new LlmError("PROVIDER", "LLM request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiCompatible(opts: LlmGenerateOptions): Promise<string> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmError("CONFIG", "LLM_API_KEY is not configured.");
  }

  const baseUrl =
    process.env.LLM_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini";

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages,
        ],
      }),
    });

    if (res.status === 429) {
      throw new LlmError("RATE_LIMIT", "LLM provider quota or rate limit exceeded.");
    }

    if (!res.ok) {
      throw new LlmError("PROVIDER", `LLM provider returned status ${res.status}.`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new LlmError("PROVIDER", "LLM provider returned an empty response.");
    }

    return text;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError("TIMEOUT", "LLM request timed out.");
    }
    throw new LlmError("PROVIDER", "LLM request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function callBedrock(opts: LlmGenerateOptions): Promise<string> {
  const { BedrockRuntimeClient, ConverseCommand } = await import(
    "@aws-sdk/client-bedrock-runtime"
  );
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const modelId =
    process.env.LLM_MODEL?.trim() ||
    process.env.BEDROCK_MODEL_ID?.trim() ||
    "amazon.nova-lite-v1:0";

  const client = new BedrockRuntimeClient({ region });
  const command = new ConverseCommand({
    modelId,
    system: [{ text: opts.systemPrompt }],
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: {
      temperature: 0.2,
      maxTokens: 450,
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await client.send(command, {
      abortSignal: controller.signal,
    });
    const text =
      response.output?.message?.content
        ?.map((c) => c.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) {
      throw new LlmError("PROVIDER", "Bedrock returned an empty response.");
    }
    return text;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError("TIMEOUT", "LLM request timed out.");
    }
    throw new LlmError("PROVIDER", "Bedrock request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Single provider-agnostic entry point for chat completions.
 * Swap providers via LLM_PROVIDER (gemini | openai | bedrock) without touching callers.
 */
export async function generateChatReply(
  opts: LlmGenerateOptions
): Promise<string> {
  const provider = (process.env.LLM_PROVIDER?.trim().toLowerCase() || "gemini");
  if (provider === "bedrock") {
    return callBedrock(opts);
  }
  if (provider === "openai") {
    return callOpenAiCompatible(opts);
  }
  return callGemini(opts);
}
