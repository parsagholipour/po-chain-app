"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { AssistantMessageList } from "@/components/assistant/assistant-message-list";
import {
  describeAssistantPageContext,
  useAssistantChat,
} from "@/components/assistant/use-assistant-chat";

export function AssistantSheet({
  open,
  onOpenChange,
  activeStoreId,
  activeStoreName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeStoreId: string | null;
  activeStoreName: string | null;
}) {
  const {
    messages,
    isPending,
    pageContext,
    starterPrompts,
    sendMessage,
    clearMessages,
  } = useAssistantChat({ activeStoreId });

  const pageLabel = describeAssistantPageContext(pageContext);
  const disabled = !activeStoreId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-none flex-col gap-0 border-border bg-background p-0 text-foreground sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="border-b border-border/80 px-4 py-4 text-left sm:px-5">
          <SheetTitle>AI Assistant</SheetTitle>
          <SheetDescription>
            {disabled
              ? "No active store is assigned to this account yet."
              : `Scoped to ${activeStoreName ?? "the active store"} - ${pageLabel}`}
          </SheetDescription>
        </SheetHeader>

        {disabled ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Assign a store to your account before using the assistant. It only works with the current active store in this version.
          </div>
        ) : (
          <>
            <AssistantMessageList
              messages={messages}
              isPending={isPending}
              starterPrompts={starterPrompts}
              onStarterPrompt={(prompt) => void sendMessage(prompt)}
            />
            <AssistantComposer
              disabled={disabled}
              isPending={isPending}
              hasMessages={messages.length > 0}
              onSubmit={sendMessage}
              onClear={clearMessages}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
