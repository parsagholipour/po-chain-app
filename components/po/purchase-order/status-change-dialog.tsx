"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moStatusLabels } from "@/lib/po/status-labels";
import type { MoManufacturerPivot } from "@/lib/types/api";
import { uploadFileToStorage } from "@/lib/upload-client";
import { Loader2 } from "lucide-react";

/** ISO local datetime string for <input type="datetime-local"> */
function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type StatusChangeTarget = {
  row: MoManufacturerPivot;
  targetStatus: string;
};

type FieldSpec = {
  key: string;
  label: string;
  type: "datetime" | "number" | "text" | "file";
};

const statusOrder = [
  "initial",
  "deposit_paid",
  "manufacturing",
  "balance_paid",
  "ready_to_pickup",
  "picked_up",
] as const;

const statusFieldMap: Record<string, FieldSpec[]> = {
  deposit_paid: [
    { key: "depositPaidAt", label: "Paid at", type: "datetime" },
    { key: "depositPaidAmount", label: "Paid amount", type: "number" },
    { key: "depositRefNumber", label: "Ref number", type: "text" },
    { key: "depositDocumentKey", label: "Document", type: "file" },
  ],
  manufacturing: [
    { key: "manufacturingStartedAt", label: "Started at", type: "datetime" },
    { key: "estimatedCompletionAt", label: "Estimated Completion Time", type: "datetime" },
  ],
  balance_paid: [
    { key: "balancePaidAt", label: "Paid at", type: "datetime" },
    { key: "balancePaidAmount", label: "Paid amount", type: "number" },
    { key: "balanceRefNumber", label: "Ref number", type: "text" },
    { key: "balanceDocumentKey", label: "Document", type: "file" },
  ],
  ready_to_pickup: [
    { key: "readyAt", label: "Ready at", type: "datetime" },
  ],
  picked_up: [
    { key: "pickedUpAt", label: "Picked up at", type: "datetime" },
  ],
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StatusChangeTarget | null;
  onConfirm: (
    manufacturerId: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
};

function getDefaultDatetime(
  row: MoManufacturerPivot,
  fieldKey: string,
): string {
  const existing = row[fieldKey as keyof MoManufacturerPivot];
  if (existing && typeof existing === "string") {
    return toLocalIso(new Date(existing));
  }
  return toLocalIso(new Date());
}

function getExistingDatetime(
  row: MoManufacturerPivot,
  fieldKey: string,
): string {
  const existing = row[fieldKey as keyof MoManufacturerPivot];
  if (existing && typeof existing === "string") {
    return toLocalIso(new Date(existing));
  }
  return "";
}

type StatusFieldGroup = {
  status: string;
  label: string;
  fields: FieldSpec[];
};

function groupedFieldsUpToStatus(status: string): StatusFieldGroup[] {
  const idx = statusOrder.indexOf(status as (typeof statusOrder)[number]);
  if (idx < 0) return [];
  const groups: StatusFieldGroup[] = [];
  for (let i = 0; i <= idx; i++) {
    const s = statusOrder[i];
    const group = statusFieldMap[s];
    if (group?.length) {
      groups.push({ status: s, label: moStatusLabels[s] ?? s, fields: group });
    }
  }
  return groups;
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Change status to{" "}
            {target
              ? (moStatusLabels[target.targetStatus] ?? target.targetStatus)
              : ""}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <StatusChangeForm
            key={`${target.row.manufacturerId}-${target.targetStatus}`}
            target={target}
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// --------------- Edit Pivot Details Dialog ---------------

type EditPivotDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MoManufacturerPivot | null;
  onSave: (
    manufacturerId: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
};

export function EditPivotDetailsDialog({
  open,
  onOpenChange,
  row,
  onSave,
}: EditPivotDetailsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit step details</DialogTitle>
        </DialogHeader>
        {row ? (
          <EditPivotDetailsForm
            key={`${row.manufacturerId}-${row.status}`}
            row={row}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditPivotDetailsForm({
  row,
  onOpenChange,
  onSave,
}: {
  row: MoManufacturerPivot;
  onOpenChange: (open: boolean) => void;
  onSave: (
    manufacturerId: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const groups = groupedFieldsUpToStatus(row.status);
  const allFields = groups.flatMap((g) => g.fields);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of allFields) {
      if (f.type === "datetime") {
        init[f.key] = getExistingDatetime(row, f.key);
      } else if (f.type === "number") {
        const existing = row[f.key as keyof MoManufacturerPivot];
        init[f.key] = existing != null ? String(existing) : "";
      } else if (f.type === "text") {
        const existing = row[f.key as keyof MoManufacturerPivot];
        init[f.key] = typeof existing === "string" ? existing : "";
      }
    }
    return init;
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};

      for (const f of allFields) {
        if (f.type === "datetime") {
          const v = values[f.key];
          body[f.key] = v ? new Date(v).toISOString() : null;
        } else if (f.type === "number") {
          const v = values[f.key];
          body[f.key] = v ? Number(v) : null;
        } else if (f.type === "text") {
          body[f.key] = values[f.key] || null;
        } else if (f.type === "file") {
          const file = files[f.key];
          if (file) {
            try {
              body[f.key] = await uploadFileToStorage(file, "pivot-docs");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "File upload failed",
              );
              setSubmitting(false);
              return;
            }
          }
        }
      }

      await onSave(row.manufacturerId, body);
      onOpenChange(false);
    } catch {
      // Parent handles error toast
    } finally {
      setSubmitting(false);
    }
  }

  if (groups.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          No step details to edit for this status.
        </p>
        <DialogFooter className="mt-4 border-0 bg-transparent">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-3">
        {groups.map((g) => (
          <Card key={g.status} className="border-border/80">
            <CardHeader className="px-4 py-2.5">
              <CardTitle className="text-sm font-medium">{g.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <FieldSet className="gap-3">
                <FieldGroup className="gap-3">
                  {g.fields.map((f) => {
                    if (f.type === "file") {
                      return (
                        <div key={f.key} className="space-y-1.5">
                          <Label className="text-xs">{f.label} (optional)</Label>
                          <Input
                            type="file"
                            disabled={submitting}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setFiles((prev) => ({ ...prev, [f.key]: file }));
                            }}
                          />
                        </div>
                      );
                    }
                    return (
                      <Field key={f.key} className="gap-1">
                        <FieldLabel className="text-xs">{f.label}</FieldLabel>
                        <FieldContent>
                          <Input
                            type={
                              f.type === "datetime"
                                ? "datetime-local"
                                : f.type === "number"
                                  ? "number"
                                  : "text"
                            }
                            step={f.type === "number" ? "0.01" : undefined}
                            value={values[f.key] ?? ""}
                            disabled={submitting}
                            onChange={(e) =>
                              setValues((prev) => ({
                                ...prev,
                                [f.key]: e.target.value,
                              }))
                            }
                          />
                        </FieldContent>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>
        ))}
      </div>
      <DialogFooter className="mt-4 border-0 bg-transparent">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// --------------- Status Change Dialog (on status transition) ---------------

function StatusChangeForm({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: StatusChangeTarget;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    manufacturerId: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const fields = statusFieldMap[target.targetStatus] ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "datetime") {
        init[f.key] = getDefaultDatetime(target.row, f.key);
      } else if (f.type === "number") {
        const existing = target.row[f.key as keyof MoManufacturerPivot];
        init[f.key] = existing != null ? String(existing) : "";
      } else if (f.type === "text") {
        const existing = target.row[f.key as keyof MoManufacturerPivot];
        init[f.key] = typeof existing === "string" ? existing : "";
      }
    }
    return init;
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        status: target.targetStatus,
      };

      for (const f of fields) {
        if (f.type === "datetime") {
          const v = values[f.key];
          body[f.key] = v ? new Date(v).toISOString() : null;
        } else if (f.type === "number") {
          const v = values[f.key];
          body[f.key] = v ? Number(v) : null;
        } else if (f.type === "text") {
          body[f.key] = values[f.key] || null;
        } else if (f.type === "file") {
          const file = files[f.key];
          if (file) {
            try {
              body[f.key] = await uploadFileToStorage(file, "pivot-docs");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "File upload failed",
              );
              setSubmitting(false);
              return;
            }
          }
        }
      }

      await onConfirm(target.row.manufacturerId, body);
      onOpenChange(false);
    } catch {
      // Parent handles error toast
    } finally {
      setSubmitting(false);
    }
  }

  if (fields.length === 0) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onConfirm(target.row.manufacturerId, {
              status: target.targetStatus,
            });
            onOpenChange(false);
          } catch {
            // Parent handles
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          No additional information is required for this status.
        </p>
        <DialogFooter className="mt-4 border-0 bg-transparent">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-3">
          {fields.map((f) => {
            if (f.type === "file") {
              return (
                <div key={f.key} className="space-y-2">
                  <Label>{f.label} (optional)</Label>
                  <Input
                    type="file"
                    disabled={submitting}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setFiles((prev) => ({ ...prev, [f.key]: file }));
                    }}
                  />
                </div>
              );
            }
            return (
              <Field key={f.key} className="gap-1.5">
                <FieldLabel>{f.label}</FieldLabel>
                <FieldContent>
                  <Input
                    type={
                      f.type === "datetime"
                        ? "datetime-local"
                        : f.type === "number"
                          ? "number"
                          : "text"
                    }
                    step={f.type === "number" ? "0.01" : undefined}
                    value={values[f.key] ?? ""}
                    disabled={submitting}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                  />
                </FieldContent>
              </Field>
            );
          })}
        </FieldGroup>
      </FieldSet>
      <DialogFooter className="mt-4 border-0 bg-transparent">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Confirm"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
