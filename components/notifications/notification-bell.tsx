"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, MailWarning } from "lucide-react";

import { api } from "@/lib/axios";
import type { NotificationsResponse } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const notificationsKey = ["notifications"] as const;

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function priorityClassName(priority: string, unread: boolean) {
  if (!unread) return "border-border/70 bg-background";
  if (priority === "urgent") return "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/20";
  if (priority === "important") {
    return "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/20";
  }
  return "border-primary/30 bg-primary/5";
}

export function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...notificationsKey, unreadOnly],
    enabled,
    refetchInterval: open ? 30_000 : 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (unreadOnly) params.set("unread", "1");
      const { data } = await api.get<NotificationsResponse>(
        `/api/notifications?${params.toString()}`,
      );
      return data;
    },
  });

  const unreadCount = query.data?.unreadCount ?? 0;
  const rows = query.data?.rows ?? [];

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/notifications/${id}`, { read: true });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post("/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationsKey });
    },
  });

  const unreadLabel = useMemo(() => {
    if (unreadCount <= 0) return "No unread notifications";
    if (unreadCount === 1) return "1 unread notification";
    return `${unreadCount} unread notifications`;
  }, [unreadCount]);

  if (!enabled) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        type="button"
        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-xs transition-colors hover:bg-muted"
        aria-label={unreadLabel}
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[min(100%,420px)] flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>{unreadLabel}</SheetDescription>
            </div>
            <Button
              type="button"
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setUnreadOnly((value) => !value)}
            >
              Unread
            </Button>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              {markAllRead.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              Mark all read
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {query.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            ) : query.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                Notifications could not be loaded.
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                <MailWarning className="size-5" />
                {unreadOnly ? "No unread notifications." : "No notifications yet."}
              </div>
            ) : (
              rows.map((notification) => {
                const unread = !notification.readAt;
                const content = (
                  <div
                    className={cn(
                      "rounded-md border p-3 transition-colors hover:bg-muted/60",
                      priorityClassName(notification.priority, unread),
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          unread ? "bg-primary" : "bg-muted-foreground/35",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground">
                            {notification.title}
                          </p>
                          {notification.priority === "urgent" ? (
                            <Badge variant="destructive">Urgent</Badge>
                          ) : null}
                        </div>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateTimeFormatter.format(new Date(notification.createdAt))}
                        </p>
                      </div>
                    </div>
                  </div>
                );

                if (!notification.href) {
                  return <div key={notification.id}>{content}</div>;
                }

                return (
                  <Link
                    key={notification.id}
                    href={notification.href}
                    onClick={() => {
                      if (unread) markRead.mutate(notification.id);
                      setOpen(false);
                    }}
                    className="block"
                  >
                    {content}
                  </Link>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
