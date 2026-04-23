"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type {
  AssistantMessage,
  AssistantPageContext,
  AssistantStreamEvent,
} from "@/lib/types/assistant";

const SESSION_KEY_PREFIX = "assistant:chat:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function makeMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildStorageKey(storeId: string | null) {
  return `${SESSION_KEY_PREFIX}:${storeId ?? "none"}`;
}

function parseStoredMessages(raw: string | null): AssistantMessage[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const message = item as Partial<AssistantMessage>;
      if (
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        typeof message.id !== "string"
      ) {
        return [];
      }

      return [
        {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt:
            typeof message.createdAt === "string"
              ? message.createdAt
              : new Date().toISOString(),
          sources: Array.isArray(message.sources) ? message.sources : [],
          state: message.state === "streaming" || message.state === "error" ? message.state : "ready",
        } satisfies AssistantMessage,
      ];
    });
  } catch {
    return [];
  }
}

function parseErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return "The assistant request failed.";
}

function splitSseEvents(buffer: string) {
  const blocks = buffer.split("\n\n");
  return {
    complete: blocks.slice(0, -1),
    remainder: blocks.at(-1) ?? "",
  };
}

function parseSseBlock(block: string): AssistantStreamEvent | null {
  const data = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) return null;

  try {
    return JSON.parse(data) as AssistantStreamEvent;
  } catch {
    return null;
  }
}

type SearchLike = {
  get(name: string): string | null;
  toString(): string;
};

export function buildAssistantPageContext(
  pathname: string,
  searchParams: SearchLike,
): AssistantPageContext | null {
  const search = searchParams.toString();

  if (pathname === "/") {
    return { pathname, search, entityType: "dashboard" };
  }

  if (pathname.startsWith("/analytics")) {
    return { pathname, search, entityType: "analytics" };
  }

  const segments = pathname.split("/").filter(Boolean);
  const maybeId = segments[1];

  if (segments[0] === "purchase-orders" && looksLikeUuid(maybeId)) {
    return { pathname, search, entityType: "po", entityId: maybeId };
  }

  if (segments[0] === "stock-orders" && looksLikeUuid(maybeId)) {
    return { pathname, search, entityType: "so", entityId: maybeId };
  }

  if (segments[0] === "manufacturing-orders" && looksLikeUuid(maybeId)) {
    return { pathname, search, entityType: "mo", entityId: maybeId };
  }

  if (pathname === "/shipping") {
    const shippingId = searchParams.get("id");
    if (looksLikeUuid(shippingId)) {
      return { pathname, search, entityType: "shipping", entityId: shippingId };
    }
  }

  return null;
}

export function describeAssistantPageContext(pageContext: AssistantPageContext | null) {
  if (!pageContext) return "General app context";

  switch (pageContext.entityType) {
    case "dashboard":
      return "Dashboard";
    case "analytics":
      return pageContext.pathname.startsWith("/analytics/")
        ? pageContext.pathname.replace("/analytics/", "Analytics - ")
        : "Analytics";
    case "po":
      return "Current purchase order";
    case "so":
      return "Current stock order";
    case "mo":
      return "Current manufacturing order";
    case "shipping":
      return "Current shipment";
    default:
      return "General app context";
  }
}

export function useAssistantChat({ activeStoreId }: { activeStoreId: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageContext = buildAssistantPageContext(pathname, searchParams);
  const storageKey = buildStorageKey(activeStoreId);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeStoreId) {
      setMessages([]);
      return;
    }

    const stored = parseStoredMessages(window.sessionStorage.getItem(storageKey));
    setMessages(stored);
  }, [activeStoreId, storageKey]);

  useEffect(() => {
    if (!activeStoreId) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [activeStoreId, messages, storageKey]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const starterPrompts = pageContext?.entityType
    ? [
        "What is the status of this current record?",
        "Summarize the key issues on this page.",
        "What should I look at next here?",
      ]
    : [
        "How many open POs, SOs, and MOs do I have?",
        "Show recent in-transit shipments.",
        "Summarize the dashboard KPIs for this range.",
      ];

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isPending || !activeStoreId) return;

    const userMessage: AssistantMessage = {
      id: makeMessageId(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      state: "ready",
    };
    const assistantMessageId = makeMessageId();
    const assistantPlaceholder: AssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      sources: [],
      state: "streaming",
    };

    const outboundMessages = [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: trimmed },
    ];

    setMessages((current) => [...current, userMessage, assistantPlaceholder]);
    setIsPending(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const requestBody: {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        pageContext?: AssistantPageContext;
      } = {
        messages: outboundMessages,
      };

      if (pageContext) {
        requestBody.pageContext = pageContext;
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = "The assistant request failed.";
        try {
          errorMessage = parseErrorMessage(await response.json());
        } catch {
          try {
            const text = await response.text();
            if (text.trim().length > 0) errorMessage = text;
          } catch {
            // Keep fallback.
          }
        }

        console.error("[assistant] Request failed.", {
          status: response.status,
          pageContext,
          errorMessage,
        });

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: errorMessage,
                  state: "error",
                }
              : message,
          ),
        );
        return;
      }

      if (!response.body) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: "The assistant returned an empty response stream.",
                  state: "error",
                }
              : message,
          ),
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { complete, remainder } = splitSseEvents(buffer);
        buffer = remainder;

        for (const block of complete) {
          const event = parseSseBlock(block);
          if (!event) continue;

          if (event.type === "chunk") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content}${event.content}`,
                    }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "sources") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      sources: event.sources,
                    }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "error") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: message.content || event.message,
                      state: "error",
                    }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "done") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      state: message.state === "error" ? "error" : "ready",
                    }
                  : message,
              ),
            );
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : "The assistant request failed.";

      console.error("[assistant] Network or stream failure.", {
        pageContext,
        error,
      });

      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: item.content || message,
                state: "error",
              }
            : item,
        ),
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsPending(false);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId && message.state === "streaming"
            ? { ...message, state: "ready" }
            : message,
        ),
      );
    }
  }

  function clearMessages() {
    setMessages([]);
    if (activeStoreId) {
      window.sessionStorage.removeItem(storageKey);
    }
  }

  return {
    messages,
    isPending,
    pageContext,
    starterPrompts,
    sendMessage,
    clearMessages,
  };
}
