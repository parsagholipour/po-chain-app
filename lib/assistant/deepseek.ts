import "server-only";

type DeepSeekToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: DeepSeekToolCall[];
};

export type DeepSeekToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    strict: true;
    parameters: Record<string, unknown>;
  };
};

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: DeepSeekChatMessage;
  }>;
};

export class DeepSeekRequestError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "DeepSeekRequestError";
    this.status = status;
  }
}

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBaseUrl() {
  return (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
}

export function getDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
}

export function getAssistantTimeoutMs() {
  return readIntEnv("ASSISTANT_TIMEOUT_MS", 20_000);
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return payload.error?.message ?? payload.message ?? response.statusText;
  } catch {
    try {
      const text = await response.text();
      return text || response.statusText;
    } catch {
      return response.statusText;
    }
  }
}

export async function createDeepSeekChatCompletion({
  messages,
  tools,
  temperature = 0.1,
}: {
  messages: DeepSeekChatMessage[];
  tools?: DeepSeekToolDefinition[];
  temperature?: number;
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekRequestError("DeepSeek API key is not configured.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), getAssistantTimeoutMs());

  try {
    const response = await fetch(`${resolveBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getDeepSeekModel(),
        messages,
        tools,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DeepSeekRequestError(await readErrorMessage(response), response.status);
    }

    const payload = (await response.json()) as DeepSeekChatCompletionResponse;
    const message = payload.choices?.[0]?.message;
    if (!message) {
      throw new DeepSeekRequestError("DeepSeek returned an empty response.", 502);
    }

    return message;
  } catch (error) {
    if (error instanceof DeepSeekRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekRequestError("The assistant request timed out.", 504);
    }
    throw new DeepSeekRequestError("Unable to reach DeepSeek right now.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
