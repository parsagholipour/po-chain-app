"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoLinesSelectTable } from "@/components/po/purchase-order-wizard/po-lines-select-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PoLineRow, PoOsd, PoOsdResolution, PoOsdType } from "@/lib/types/api";
import type { OsdCreateInput, OsdPatchInput } from "@/lib/validations/purchase-order";
import { uploadFileToStorage } from "@/lib/upload-client";
import { apiErrorMessage } from "@/lib/api-error-message";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type LineRow = { purchaseOrderLineId: string; quantity: number };

function selectedLineIds(rows: LineRow[]) {
  return [...new Set(rows.map((r) => r.purchaseOrderLineId).filter(Boolean))];
}

function moRequiredForLines(lineIds: string[], allLines: PoLineRow[]): boolean {
  if (lineIds.length === 0) return false;
  return lineIds.every((id) => {
    const row = allLines.find((l) => l.id === id);
    return row != null && row.allocations.length > 0;
  });
}

function moIdsIntersection(lineIds: string[], allLines: PoLineRow[]): string[] {
  const selected = allLines.filter((l) => lineIds.includes(l.id));
  if (selected.length === 0) return [];
  let intersection: Set<string> | null = null;
  for (const line of selected) {
    const ids = new Set(line.allocations.map((a) => a.manufacturingOrderId));
    intersection =
      intersection == null
        ? ids
        : new Set([...intersection].filter((x: string) => ids.has(x)));
  }
  return intersection ? [...intersection] : [];
}

function manufacturersForMo(
  moId: string,
  lineIds: string[],
  allLines: PoLineRow[],
): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const line of allLines.filter((l) => lineIds.includes(l.id))) {
    for (const a of line.allocations) {
      if (a.manufacturingOrderId === moId) {
        map.set(a.manufacturerId, a.manufacturer.name);
      }
    }
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function moSelectLabel(moId: string, allLines: PoLineRow[]) {
  const a = allLines.flatMap((l) => l.allocations).find((x) => x.manufacturingOrderId === moId);
  if (!a) return moId;
  return `MO #${a.manufacturingOrder.number} — ${a.manufacturingOrder.name}`;
}

const OSD_MO_MANUFACTURER_CONFLICT_MSG =
  "Selected lines use different manufacturers on the same manufacturing order. Create separate OS&D records.";

/**
 * True when some manufacturing order shared by all selected lines has no single manufacturer
 * common to every line (lines must be split across OS&D entries).
 */
function linesHaveMoManufacturerConflict(lineIds: string[], allLines: PoLineRow[]): boolean {
  const unique = [...new Set(lineIds)].filter(Boolean);
  if (unique.length < 2) return false;
  const commonMos = moIdsIntersection(unique, allLines);
  for (const moId of commonMos) {
    let intersection: Set<string> | null = null;
    for (const lineId of unique) {
      const line = allLines.find((l) => l.id === lineId);
      if (!line) return true;
      const mfs = new Set(
        line.allocations
          .filter((a) => a.manufacturingOrderId === moId)
          .map((a) => a.manufacturerId),
      );
      if (mfs.size === 0) return true;
      intersection =
        intersection == null
          ? mfs
          : new Set([...intersection].filter((x: string) => mfs.has(x)));
    }
    if (!intersection || intersection.size === 0) return true;
  }
  return false;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: PoLineRow[];
  mode: "create" | "edit";
  editing: PoOsd | null;
  onCreate: (body: OsdCreateInput) => Promise<void>;
  onEdit: (osdId: string, body: OsdPatchInput) => Promise<void>;
};

const typeLabels: Record<PoOsdType, string> = {
  overage: "Overage",
  shortage: "Shortage",
  damage: "Damage",
};

const resolutionLabels: Record<PoOsdResolution, string> = {
  charged: "Charged",
  returned: "Returned",
  sent: "Sent",
};

export function AddOsdDialog({
  open,
  onOpenChange,
  lines: poLines,
  mode,
  editing,
  onCreate,
  onEdit,
}: Props) {
  const [type, setType] = useState<PoOsdType>(() =>
    mode === "edit" && editing ? editing.type : "overage",
  );
  const [resolution, setResolution] = useState<PoOsdResolution>(() =>
    mode === "edit" && editing ? editing.resolution : "charged",
  );
  const [lineRows, setLineRows] = useState<LineRow[]>(() =>
    mode === "edit" && editing
      ? [
          ...editing.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            quantity: l.quantity,
          })),
          { purchaseOrderLineId: "", quantity: 1 },
        ]
      : [{ purchaseOrderLineId: "", quantity: 1 }],
  );
  const [manufacturingOrderId, setManufacturingOrderId] = useState<string | null>(() =>
    mode === "edit" && editing ? editing.manufacturingOrderId : null,
  );
  const [manufacturerId, setManufacturerId] = useState<string | null>(() =>
    mode === "edit" && editing ? editing.manufacturerId : null,
  );
  const [notes, setNotes] = useState(() =>
    mode === "edit" && editing ? (editing.notes ?? "") : "",
  );
  const [documentKey, setDocumentKey] = useState<string | null>(() =>
    mode === "edit" && editing ? editing.documentKey : null,
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selIds = useMemo(() => selectedLineIds(lineRows), [lineRows]);
  const moRequired = useMemo(() => moRequiredForLines(selIds, poLines), [selIds, poLines]);
  const moOptions = useMemo(() => moIdsIntersection(selIds, poLines), [selIds, poLines]);
  const mfOptions = useMemo(
    () =>
      manufacturingOrderId
        ? manufacturersForMo(manufacturingOrderId, selIds, poLines)
        : [],
    [manufacturingOrderId, selIds, poLines],
  );

  const manufacturerSelectHint = useMemo(() => {
    if (mfOptions.length > 0) return null;
    if (selIds.length === 0) return "Select at least one product line.";
    if (!moRequired) {
      return "Manufacturers apply only when every selected line has manufacturing allocations.";
    }
    if (moOptions.length === 0) {
      return "Selected lines must share a manufacturing order before you can choose a manufacturer.";
    }
    if (!manufacturingOrderId) return "Select a manufacturing order first.";
    return "No manufacturers are available for this manufacturing order and line selection.";
  }, [
    mfOptions.length,
    selIds.length,
    moRequired,
    moOptions.length,
    manufacturingOrderId,
  ]);

  useEffect(() => {
    if (type === "damage") {
      setResolution("charged");
    }
  }, [type]);

  useEffect(() => {
    if (!open) return;
    if (moRequired && moOptions.length === 1 && manufacturingOrderId !== moOptions[0]) {
      setManufacturingOrderId(moOptions[0]!);
    }
    if (!moRequired && selIds.length > 0 && moOptions.length === 0) {
      setManufacturingOrderId(null);
      setManufacturerId(null);
    }
  }, [open, moRequired, moOptions, manufacturingOrderId, selIds.length]);

  useEffect(() => {
    if (!open) return;
    if (!manufacturingOrderId) {
      setManufacturerId(null);
      return;
    }
    setManufacturerId((prev) => {
      const mfs = manufacturersForMo(manufacturingOrderId, selIds, poLines);
      if (mfs.length === 0) return null;
      if (mfs.length === 1) return mfs[0]!.id;
      if (prev != null && mfs.some((m) => m.id === prev)) return prev;
      return null;
    });
  }, [open, manufacturingOrderId, selIds, poLines]);

  useEffect(() => {
    if (!manufacturingOrderId) return;
    if (moOptions.length > 0 && !moOptions.includes(manufacturingOrderId)) {
      setManufacturingOrderId(null);
      setManufacturerId(null);
    }
  }, [moOptions, manufacturingOrderId]);

  const resolutionChoices: PoOsdResolution[] =
    type === "overage"
      ? ["charged", "returned"]
      : type === "shortage"
        ? ["charged", "sent"]
        : ["charged"];

  const lineSelectItems = poLines.map((l) => ({
    value: l.id,
    label: `${l.product.name} (${l.product.sku})`,
    keywords: l.product.sku,
  }));

  function updateOsdLine(i: number, patch: Partial<LineRow>) {
    setLineRows((prev) => {
      const next = [...prev];
      const prevRow = next[i]!;
      next[i] = { ...prevRow, ...patch };
      const ids = selectedLineIds(next.filter((r) => r.purchaseOrderLineId));
      if (ids.length >= 2 && linesHaveMoManufacturerConflict(ids, poLines)) {
        queueMicrotask(() => toast.error(OSD_MO_MANUFACTURER_CONFLICT_MSG));
        return prev;
      }
      const isLast = i === next.length - 1;
      const wasEmpty = !prevRow.purchaseOrderLineId;
      const nowFilled = next[i]!.purchaseOrderLineId.length > 0;
      if (isLast && wasEmpty && nowFilled) {
        next.push({ purchaseOrderLineId: "", quantity: 1 });
      }
      return next;
    });
  }

  function removeOsdLine(i: number) {
    setLineRows((prev) => {
      let next = prev.filter((_, j) => j !== i);
      const last = next[next.length - 1];
      if (!last || last.purchaseOrderLineId.length > 0) {
        next = [...next, { purchaseOrderLineId: "", quantity: 1 }];
      }
      return next;
    });
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const key = await uploadFileToStorage(file, "purchase-orders/osd");
      setDocumentKey(key);
      toast.success("Document attached");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rows = lineRows.filter((r) => r.purchaseOrderLineId);
    if (rows.length === 0) {
      toast.error("Add at least one line");
      return;
    }
    const ids = selectedLineIds(rows);
    if (ids.length !== rows.length) {
      toast.error("Duplicate lines are not allowed");
      return;
    }
    if (linesHaveMoManufacturerConflict(ids, poLines)) {
      toast.error(OSD_MO_MANUFACTURER_CONFLICT_MSG);
      return;
    }
    if (moRequired && (!manufacturingOrderId || moOptions.length === 0)) {
      toast.error("Select a valid manufacturing order for the selected lines");
      return;
    }
    if (manufacturingOrderId && mfOptions.length > 1 && !manufacturerId) {
      toast.error("Select the manufacturer");
      return;
    }

    const bodyLines = rows.map((r) => ({
      purchaseOrderLineId: r.purchaseOrderLineId,
      quantity: r.quantity,
    }));

    setSubmitting(true);
    try {
      if (mode === "create") {
        const payload: OsdCreateInput = {
          type,
          resolution,
          lines: bodyLines,
          manufacturingOrderId: manufacturingOrderId ?? undefined,
          manufacturerId: manufacturerId ?? undefined,
          documentKey: documentKey ?? undefined,
          notes: notes.trim() ? notes.trim() : undefined,
        };
        await onCreate(payload);
      } else if (editing) {
        const payload: OsdPatchInput = {
          type,
          resolution,
          lines: bodyLines,
          manufacturingOrderId: manufacturingOrderId ?? null,
          manufacturerId: manufacturerId ?? null,
          documentKey: documentKey ?? null,
          notes: notes.trim() ? notes.trim() : null,
        };
        await onEdit(editing.id, payload);
      }
      onOpenChange(false);
    } catch (err) {
      if (!axios.isAxiosError(err)) {
        toast.error(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New OS&D" : "Edit OS&D"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              items={(["overage", "shortage", "damage"] as const).map((t) => ({
                value: t,
                label: typeLabels[t],
              }))}
              onValueChange={(v) => {
                if (v) {
                  setType(v as PoOsdType);
                  if (v === "overage") setResolution("charged");
                  if (v === "shortage") setResolution("charged");
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overage">{typeLabels.overage}</SelectItem>
                <SelectItem value="shortage">{typeLabels.shortage}</SelectItem>
                <SelectItem value="damage">{typeLabels.damage}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resolution</Label>
            <Select
              value={resolution}
              items={resolutionChoices.map((r) => ({ value: r, label: resolutionLabels[r] }))}
              disabled={type === "damage"}
              onValueChange={(v) => {
                if (v) setResolution(v as PoOsdResolution);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resolutionChoices.map((r) => (
                  <SelectItem key={r} value={r}>
                    {resolutionLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Lines</Label>
            <PoLinesSelectTable
              selectColumnLabel="Product line"
              selectPlaceholder="Select line"
              emptyItemsMessage="This purchase order has no lines."
              items={lineSelectItems}
              getItemsForRow={(rowIndex, row) => {
                const chosenElsewhere = new Set(
                  lineRows
                    .map((r, j) =>
                      j !== rowIndex && r.purchaseOrderLineId ? r.purchaseOrderLineId : "",
                    )
                    .filter((id): id is string => id.length > 0),
                );
                const otherIds = lineRows
                  .map((r, j) =>
                    j !== rowIndex && r.purchaseOrderLineId ? r.purchaseOrderLineId : "",
                  )
                  .filter((id): id is string => id.length > 0);
                return lineSelectItems.filter((it) => {
                  if (chosenElsewhere.has(it.value) && it.value !== row.entityId) return false;
                  if (it.value === row.entityId) return true;
                  if (otherIds.length === 0) return true;
                  return !linesHaveMoManufacturerConflict([...otherIds, it.value], poLines);
                });
              }}
              rows={lineRows.map((r) => ({
                entityId: r.purchaseOrderLineId,
                quantity: r.quantity,
              }))}
              onUpdateRow={(i, patch) => {
                const p: Partial<LineRow> = {};
                if (patch.entityId !== undefined) p.purchaseOrderLineId = patch.entityId;
                if (patch.quantity !== undefined) p.quantity = patch.quantity;
                updateOsdLine(i, p);
              }}
              onRemoveRow={removeOsdLine}
            />
          </div>

          {moRequired ? (
            <div className="space-y-2">
              <Label>Manufacturing order (required)</Label>
              {moOptions.length === 0 ? (
                <p className="text-sm text-destructive">
                  Selected lines are not all allocated to a common manufacturing order. Adjust line
                  selection or allocations.
                </p>
              ) : (
                <Select
                  value={manufacturingOrderId ?? ""}
                  items={moOptions.map((id) => ({
                    value: id,
                    label: moSelectLabel(id, poLines),
                  }))}
                  onValueChange={(v) => {
                    setManufacturingOrderId(v && v !== "" ? String(v) : null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moOptions.map((id) => (
                      <SelectItem key={id} value={id}>
                        {moSelectLabel(id, poLines)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>
              Manufacturer
              {mfOptions.length > 1 ? (
                <span className="font-normal text-muted-foreground"> (required)</span>
              ) : null}
            </Label>
            <Select
              value={manufacturerId ?? ""}
              items={mfOptions.map((m) => ({ value: m.id, label: m.name }))}
              disabled={mfOptions.length === 0}
              onValueChange={(v) => setManufacturerId(v && v !== "" ? String(v) : null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Manufacturer" />
              </SelectTrigger>
              <SelectContent>
                {mfOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manufacturerSelectHint ? (
              <p className="text-xs text-muted-foreground">{manufacturerSelectHint}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="osd-notes">Notes</Label>
            <Textarea
              id="osd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="osd-doc">Document</Label>
            <Input
              id="osd-doc"
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            {documentKey ? (
              <p className="text-xs text-muted-foreground">Attached (key stored)</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : mode === "create" ? (
                "Create OS&D"
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
