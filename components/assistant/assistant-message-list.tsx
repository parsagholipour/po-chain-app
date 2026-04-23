"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bot, Sparkles, User2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AssistantMessage } from "@/lib/types/assistant";

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-1 text-base font-semibold tracking-tight first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-3 text-sm font-semibold tracking-tight first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-3 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        hr: () => <hr className="my-3 border-border/70" />,
        blockquote: ({ children }) => (
          <blockquote className="mt-2 border-l-2 border-border/80 pl-3 text-muted-foreground first:mt-0">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isBlock = Boolean(className);
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs leading-6 text-foreground">
                {children}
              </code>
            );
          }

          return (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="mt-2 first:mt-0">{children}</pre>,
        a: ({ href, children }) => {
          if (!href) return <>{children}</>;

          if (href.startsWith("/")) {
            return (
              <Link href={href} className="font-medium text-primary underline underline-offset-4">
                {children}
              </Link>
            );
          }

          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              {children}
            </a>
          );
        },
        table: ({ children }) => (
          <div className="mt-2 overflow-x-auto first:mt-0">
            <table className="min-w-full border-collapse text-left text-xs">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-border/80">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border/60 last:border-b-0">{children}</tr>,
        th: ({ children }) => (
          <th className="px-2 py-1.5 font-semibold text-foreground">{children}</th>
        ),
        td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function AssistantMessageList({
  messages,
  isPending,
  starterPrompts,
  onStarterPrompt,
}: {
  messages: AssistantMessage[];
  isPending: boolean;
  starterPrompts: string[];
  onStarterPrompt: (prompt: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isPending]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      {messages.length === 0 ? (
        <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight">Ask about statuses, counts, or analytics</h3>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              The assistant can read structured data from the active store and link you to the relevant records. It cannot edit data or read document contents in v1.
            </p>
          </div>
          <div className="flex w-full max-w-lg flex-wrap justify-center gap-2">
            {starterPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onStarterPrompt(prompt)}
                className="max-w-full"
              >
                <span className="truncate">{prompt}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "w-full max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[85%]",
                  message.role === "user"
                    ? "border-primary/20 bg-primary text-primary-foreground"
                    : "border-border/80 bg-card",
                )}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                  {message.role === "assistant" ? (
                    <Bot className="size-3.5" />
                  ) : (
                    <User2 className="size-3.5" />
                  )}
                  {message.role === "assistant" ? "Assistant" : "You"}
                </div>

                {message.role === "assistant" ? (
                  <div className="text-sm leading-6 text-foreground break-words">
                    <AssistantMarkdown
                      content={message.content || (message.state === "streaming" ? "Thinking..." : "")}
                    />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.content || (message.state === "streaming" ? "Thinking..." : "")}
                  </p>
                )}

                {message.sources && message.sources.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.sources.map((source) => (
                      <Badge
                        key={`${source.kind}-${source.id}-${source.href}`}
                        variant="outline"
                        render={<Link href={source.href} />}
                        className="h-auto min-h-6 max-w-full rounded-full px-2.5 py-1 text-xs leading-5 hover:border-border hover:bg-muted"
                      >
                        <span className="truncate">{source.label}</span>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </ScrollArea>
  );
}
