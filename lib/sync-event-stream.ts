type SyncStreamRunContext = {
  startedAt: number;
};

export type SyncStreamMessage<T> =
  | {
      event: "started";
      message: string;
      startedAt: string;
    }
  | {
      event: "heartbeat";
      message: string;
      elapsedMs: number;
    }
  | {
      event: "complete";
      result: T;
      elapsedMs: number;
    }
  | {
      event: "error";
      message: string;
      elapsedMs: number;
    };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function encodeSyncStreamEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function wantsSyncEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

export function createSyncEventStream<T>(input: {
  startedMessage: string;
  heartbeatMessage: string;
  errorMessage: string;
  heartbeatMs?: number;
  run: (context: SyncStreamRunContext) => Promise<T>;
}) {
  const encoder = new TextEncoder();
  const heartbeatMs = input.heartbeatMs ?? 5_000;
  let stopStream: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const startedAt = Date.now();
      let closed = false;
      const timer: { heartbeat?: ReturnType<typeof setInterval> } = {};

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSyncStreamEvent(event, data)));
        } catch {
          closed = true;
          if (timer.heartbeat) clearInterval(timer.heartbeat);
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        if (timer.heartbeat) clearInterval(timer.heartbeat);
        try {
          controller.close();
        } catch {
          // The browser may have already closed the stream; the sync work can still finish.
        }
      }
      stopStream = close;

      send("started", {
        message: input.startedMessage,
        startedAt: new Date(startedAt).toISOString(),
      });
      timer.heartbeat = setInterval(() => {
        send("heartbeat", {
          message: input.heartbeatMessage,
          elapsedMs: Date.now() - startedAt,
        });
      }, heartbeatMs);

      void (async () => {
        try {
          const result = await input.run({ startedAt });
          send("complete", {
            result,
            elapsedMs: Date.now() - startedAt,
          });
        } catch (error) {
          send("error", {
            message: errorMessage(error, input.errorMessage),
            elapsedMs: Date.now() - startedAt,
          });
        } finally {
          close();
        }
      })();
    },
    cancel() {
      stopStream?.();
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

async function responseErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as
      | { message?: unknown }
      | null;
    if (typeof data?.message === "string") return data.message;
  }

  const text = await response.text().catch(() => "");
  return text || `Request failed (${response.status})`;
}

function parseSyncStreamBlock<T>(block: string): SyncStreamMessage<T> | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  return { event, ...data } as SyncStreamMessage<T>;
}

export async function postSyncEventStream<T>(
  url: string,
  options: {
    onEvent?: (event: SyncStreamMessage<T>) => void;
  } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    throw new Error(await responseErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    throw new Error(await responseErrorMessage(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  let hasResult = false;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const message = parseSyncStreamBlock<T>(block);
      if (!message) continue;

      options.onEvent?.(message);
      if (message.event === "complete") {
        result = message.result;
        hasResult = true;
      } else if (message.event === "error") {
        streamError = message.message;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const message = parseSyncStreamBlock<T>(buffer);
    if (message) {
      options.onEvent?.(message);
      if (message.event === "complete") {
        result = message.result;
        hasResult = true;
      } else if (message.event === "error") {
        streamError = message.message;
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!hasResult) throw new Error("Sync ended before returning a result");
  return result as T;
}
