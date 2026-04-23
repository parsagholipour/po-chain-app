import "server-only";

import { APP_NAME } from "@/lib/app-name";
import type { AssistantPageContext } from "@/lib/types/assistant";

function describePageContext(pageContext: AssistantPageContext | null) {
  if (!pageContext) {
    return "No supported page context is attached to this request.";
  }

  const base = `path=${pageContext.pathname || "/"}`;
  const entityBits = [
    pageContext.entityType ? `entityType=${pageContext.entityType}` : null,
    pageContext.entityId ? `entityId=${pageContext.entityId}` : null,
    pageContext.search ? `search=${pageContext.search}` : null,
  ].filter(Boolean);

  return entityBits.length > 0 ? `${base}; ${entityBits.join("; ")}` : base;
}

export function buildAssistantSystemPrompt({
  activeStoreName,
  pageContext,
}: {
  activeStoreName: string | null;
  pageContext: AssistantPageContext | null;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return [
    `You are the internal ${APP_NAME} assistant for operations users.`,
    `Today's date is ${today}.`,
    `The active store is ${activeStoreName ?? "the user's current store"}.`,
    "All answers must stay scoped to the active store only.",
    "You are read-only in v1. Never claim you created, updated, deleted, or scheduled anything.",
    "You can suggest pages to open, but you cannot perform writes or confirmations.",
    "Only answer using tool results or the validated page context attached to this request.",
    "If data is missing, unsupported, or outside the current store, say so plainly instead of guessing.",
    "Do not claim to read file contents, images, invoices, or OCR text. You only have structured app data in v1.",
    "When the user asks about this page, this order, this shipment, or here, prefer the get_current_page_record tool.",
    "Keep answers concise, operational, and practical. Mention store scope when it matters.",
    "If the user asks for write actions, explain that the assistant is currently read-only and offer guidance instead.",
    `Current page context: ${describePageContext(pageContext)}.`,
  ].join("\n");
}
