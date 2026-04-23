"use client";

import { useState } from "react";
import { ArrowUp, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AssistantComposer({
  disabled,
  isPending,
  hasMessages,
  onSubmit,
  onClear,
}: {
  disabled?: boolean;
  isPending?: boolean;
  hasMessages?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled || isPending) return;
    setValue("");
    await onSubmit(trimmed);
  }

  return (
    <div className="border-t border-border/80 bg-background/95 px-4 py-4 backdrop-blur sm:px-5">
      <div className="space-y-3">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            void handleSubmit();
          }}
          rows={4}
          disabled={disabled || isPending}
          placeholder={
            disabled
              ? "Assign a store to use the assistant."
              : "Ask about statuses, counts, shipping, or analytics..."
          }
          className="min-h-28 resize-none bg-card"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Active-store scoped, read-only, and limited to structured app data.
          </p>
          <div className="flex items-center gap-2">
            {hasMessages ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={isPending}
              >
                <RefreshCcw className="size-3.5" />
                New chat
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              size="sm"
              disabled={disabled || isPending || value.trim().length === 0}
            >
              <ArrowUp className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
