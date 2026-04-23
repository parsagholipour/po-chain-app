import "server-only";

import type { AssistantSource } from "@/lib/types/assistant";

export function dedupeAssistantSources(sources: AssistantSource[]): AssistantSource[] {
  const seen = new Set<string>();
  const deduped: AssistantSource[] = [];

  for (const source of sources) {
    const key = `${source.kind}:${source.id}:${source.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}
