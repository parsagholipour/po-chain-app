import "server-only";

import { z } from "zod";

export const assistantPageContextSchema = z.object({
  pathname: z.string().trim().min(1).max(200),
  search: z.string().max(500).default(""),
  entityType: z
    .enum(["po", "so", "mo", "shipping", "dashboard", "analytics"])
    .optional(),
  entityId: z.uuid().optional(),
});

export const assistantConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8_000),
});

export const assistantRequestSchema = z.object({
  messages: z.array(assistantConversationMessageSchema).min(1).max(24),
  pageContext: assistantPageContextSchema.nullish(),
});

export type AssistantRouteRequest = z.infer<typeof assistantRequestSchema>;
