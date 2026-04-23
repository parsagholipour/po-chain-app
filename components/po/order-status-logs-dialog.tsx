"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatusLog } from "@/lib/types/api";
import { ArrowRight, Loader2, Pencil, Plus, Info } from "lucide-react";

type Props = {
  title: string;
  description: string;
  logs: OrderStatusLog[];
  statusLabels: Record<string, string>;
  onSaveNote?: (logId: string, note: string | null) => Promise<void>;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatStatus(status: string, statusLabels: Record<string, string>) {
  return statusLabels[status] ?? status;
}

export function OrderStatusLogsDialog({
  title,
  description,
  logs,
  statusLabels,
  onSaveNote,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [savingLogId, setSavingLogId] = useState<string | null>(null);

  const editingLog = useMemo(
    () => logs.find((log) => log.id === editingLogId) ?? null,
    [editingLogId, logs],
  );

  function startEditing(log: OrderStatusLog) {
    setEditingLogId(log.id);
    setDraftNote(log.note ?? "");
  }

  function stopEditing() {
    setEditingLogId(null);
    setDraftNote("");
  }

  async function handleSaveNote(log: OrderStatusLog) {
    if (!onSaveNote) return;

    const trimmedDraft = draftNote.trim();
    const nextNote = trimmedDraft.length > 0 ? trimmedDraft : null;

    setSavingLogId(log.id);
    try {
      await onSaveNote(log.id, nextNote);
      stopEditing();
    } finally {
      setSavingLogId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          stopEditing();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="View status history"
          />
        }
      >
        <Info className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No status changes have been logged yet.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-border/80 bg-card/70 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  <span>{formatStatus(log.fromStatus, statusLabels)}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span>{formatStatus(log.toStatus, statusLabels)}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>{dateTimeFormatter.format(new Date(log.createdAt))}</p>
                  {log.createdBy.realName?.trim() ? (
                    <p>
                      <span className="text-muted-foreground/80">By </span>
                      {log.createdBy.realName.trim()} - {log.createdBy.realEmail?.trim()}
                    </p>
                  ) : null}
                </div>
                {editingLogId === log.id ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Note
                      </p>
                      <Textarea
                        value={draftNote}
                        onChange={(event) => setDraftNote(event.target.value)}
                        rows={4}
                        placeholder="Add context for this status change..."
                        disabled={savingLogId === log.id}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          savingLogId === log.id ||
                          (draftNote.trim() || null) === (editingLog?.note ?? null)
                        }
                        onClick={() => void handleSaveNote(log)}
                      >
                        {savingLogId === log.id ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving...
                          </>
                        ) : log.note ? (
                          "Save note"
                        ) : (
                          "Add note"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingLogId === log.id}
                        onClick={stopEditing}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {log.note ? (
                      <div className="rounded-md bg-muted/35 px-3 py-2 text-sm whitespace-pre-wrap text-foreground/90">
                        {log.note}
                      </div>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        No note added.
                      </p>
                    )}
                    {onSaveNote ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(log)}
                      >
                        {log.note ? (
                          <>
                            <Pencil className="size-3.5" />
                            Edit note
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5" />
                            Add note
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
