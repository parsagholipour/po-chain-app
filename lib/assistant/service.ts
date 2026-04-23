import "server-only";

import { dedupeAssistantSources } from "@/lib/assistant/sources";
import {
  DeepSeekRequestError,
  createDeepSeekChatCompletion,
  type DeepSeekChatMessage,
} from "@/lib/assistant/deepseek";
import { buildAssistantSystemPrompt } from "@/lib/assistant/prompt";
import {
  assistantToolDefinitions,
  collectToolSources,
  executeAssistantToolCall,
} from "@/lib/assistant/tools";
import type { AssistantPageContext, AssistantRole, AssistantSource } from "@/lib/types/assistant";

type ConversationMessage = {
  role: AssistantRole;
  content: string;
};

type RunAssistantConversationInput = {
  messages: ConversationMessage[];
  storeId: string;
  activeStoreName: string | null;
  pageContext: AssistantPageContext | null;
};

type RunAssistantConversationResult = {
  text: string;
  sources: AssistantSource[];
};

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_HISTORY_MESSAGES = readIntEnv("ASSISTANT_MAX_HISTORY_MESSAGES", 10);
const MAX_MESSAGE_CHARS = readIntEnv("ASSISTANT_MAX_MESSAGE_CHARS", 2_000);
const MAX_TOOL_STEPS = readIntEnv("ASSISTANT_TOOL_MAX_STEPS", 4);

export function getAssistantInputLimits() {
  return {
    maxHistoryMessages: MAX_HISTORY_MESSAGES,
    maxMessageChars: MAX_MESSAGE_CHARS,
  };
}

function sanitizeConversation(messages: ConversationMessage[]) {
  return messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0);
}

function normalizeAssistantText(content: string | null) {
  const normalized = (content ?? "").trim();
  return normalized.length > 0
    ? normalized
    : "I couldn't find enough structured store data to answer that clearly.";
}

export async function runAssistantConversation({
  messages,
  storeId,
  activeStoreName,
  pageContext,
}: RunAssistantConversationInput): Promise<RunAssistantConversationResult> {
  const sanitizedMessages = sanitizeConversation(messages);
  if (!sanitizedMessages.some((message) => message.role === "user")) {
    throw new DeepSeekRequestError("The assistant needs at least one user message.", 400);
  }

  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: buildAssistantSystemPrompt({ activeStoreName, pageContext }),
    },
    ...sanitizedMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const toolResults: Array<Awaited<ReturnType<typeof executeAssistantToolCall>>> = [];

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const assistantMessage = await createDeepSeekChatCompletion({
      messages: modelMessages,
      tools: assistantToolDefinitions,
    });

    const toolCalls = assistantMessage.tool_calls ?? [];
    modelMessages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    if (toolCalls.length === 0) {
      return {
        text: normalizeAssistantText(assistantMessage.content),
        sources: dedupeAssistantSources(collectToolSources(toolResults)),
      };
    }

    for (const toolCall of toolCalls) {
      const result = await executeAssistantToolCall({
        name: toolCall.function.name,
        rawArguments: toolCall.function.arguments,
        context: {
          storeId,
          pageContext,
        },
      });

      toolResults.push(result);
      modelMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.result),
      });
    }
  }

  const forcedFinal = await createDeepSeekChatCompletion({
    messages: [
      ...modelMessages,
      {
        role: "system",
        content:
          "You have reached the tool-call limit. Using only the tool results already provided, answer the user now without calling more tools.",
      },
    ],
  });

  return {
    text: normalizeAssistantText(forcedFinal.content),
    sources: dedupeAssistantSources(collectToolSources(toolResults)),
  };
}
