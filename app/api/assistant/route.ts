import { NextResponse } from "next/server";
import { DeepSeekRequestError } from "@/lib/assistant/deepseek";
import { checkAssistantRateLimit } from "@/lib/assistant/rate-limit";
import { assistantRequestSchema } from "@/lib/assistant/schemas";
import {
  getAssistantInputLimits,
  runAssistantConversation,
} from "@/lib/assistant/service";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import type { AssistantStreamEvent } from "@/lib/types/assistant";

export const runtime = "nodejs";

function readErrorMessage(error: unknown) {
  if (error instanceof DeepSeekRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The assistant could not complete this request.";
}

function streamEvent(event: AssistantStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function summarizeAssistantBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      bodyType: body === null ? "null" : typeof body,
    };
  }

  const maybeBody = body as {
    messages?: unknown;
    pageContext?: unknown;
  };

  return {
    bodyType: "object",
    messageCount: Array.isArray(maybeBody.messages) ? maybeBody.messages.length : null,
    pageContextType:
      maybeBody.pageContext === null ? "null" : typeof maybeBody.pageContext,
  };
}

function logAssistantWarning(
  message: string,
  details?: Record<string, unknown>,
  error?: unknown,
) {
  console.warn("[assistant]", message, details ?? {}, error);
}

function logAssistantError(
  message: string,
  details?: Record<string, unknown>,
  error?: unknown,
) {
  console.error("[assistant]", message, details ?? {}, error);
}

function splitIntoChunks(text: string) {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= 72) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, 72);
    const splitAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
    const nextChunk =
      splitAt > 24 ? remaining.slice(0, splitAt + 1) : remaining.slice(0, 72);

    chunks.push(nextChunk);
    remaining = remaining.slice(nextChunk.length);
  }

  return chunks;
}

export async function POST(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId, activeStore } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logAssistantWarning("Invalid JSON payload.", { userId, storeId }, error);
    return jsonError("Invalid JSON", 400);
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    logAssistantWarning("Request validation failed.", {
      userId,
      storeId,
      request: summarizeAssistantBody(body),
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return jsonFromZod(parsed.error);
  }

  const { maxHistoryMessages, maxMessageChars } = getAssistantInputLimits();
  const oversizedMessage = parsed.data.messages.find(
    (message) => message.content.length > maxMessageChars,
  );
  if (oversizedMessage) {
    return jsonError(
      `Each message must be ${maxMessageChars} characters or fewer.`,
      400,
    );
  }

  const rateLimitKey = `${userId}:${storeId}`;
  const rateLimit = checkAssistantRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        message: "Too many assistant requests. Please wait a moment and try again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const messages = parsed.data.messages.slice(-maxHistoryMessages);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runAssistantConversation({
          messages,
          storeId,
          activeStoreName: activeStore.name,
          pageContext: parsed.data.pageContext ?? null,
        });

        if (result.sources.length > 0) {
          controller.enqueue(
            encoder.encode(streamEvent({ type: "sources", sources: result.sources })),
          );
        }

        for (const chunk of splitIntoChunks(result.text)) {
          controller.enqueue(encoder.encode(streamEvent({ type: "chunk", content: chunk })));
        }

        controller.enqueue(encoder.encode(streamEvent({ type: "done" })));
      } catch (error) {
        logAssistantError(
          "Conversation run failed.",
          {
            userId,
            storeId,
            messageCount: messages.length,
            hasPageContext: parsed.data.pageContext != null,
          },
          error,
        );
        controller.enqueue(
          encoder.encode(
            streamEvent({ type: "error", message: readErrorMessage(error) }),
          ),
        );
        controller.enqueue(encoder.encode(streamEvent({ type: "done" })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
