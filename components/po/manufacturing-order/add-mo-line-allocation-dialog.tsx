"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ManufacturingOrderDetail, MoManufacturerPivot, PoLineRow } from "@/lib/types/api";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mo: ManufacturingOrderDetail;
  onSubmit: (v: {
    purchaseOrderLineId: string;
    manufacturerId: string;
    quantity?: number;
    verified?: boolean;
  }) => Promise<void>;
};

function lineRemaining(line: PoLineRow) {
  const moQuantity = line.allocations.reduce((sum, row) => sum + row.quantity, 0);
  const woQuantity = line.warehouseAllocations.reduce((sum, row) => sum + row.quantity, 0);
  return Math.max(0, line.quantity - moQuantity - woQuantity);
}

export function AddMoLineAllocationDialog({
  open,
  onOpenChange,
  mo,
  onSubmit,
}: Props) {
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [lineId, setLineId] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const poItems = useMemo(
    () =>
      mo.purchaseOrders.map((r) => {
        const prefix = r.purchaseOrder.type === "stock" ? "SO" : "PO";
        return {
          value: r.purchaseOrder.id,
          label: `${prefix} #${r.purchaseOrder.number} · ${r.purchaseOrder.name}`,
        };
      }),
    [mo.purchaseOrders],
  );

  const selectedLink = useMemo(
    () => mo.purchaseOrders.find((r) => r.purchaseOrder.id === purchaseOrderId),
    [mo.purchaseOrders, purchaseOrderId],
  );

  const allocatedLineIds = useMemo(
    () => new Set(mo.lineAllocations.map((a) => a.purchaseOrderLineId)),
    [mo.lineAllocations],
  );

  const { data: lines = [], isFetching } = useQuery({
    queryKey: [
      "mo-allocation-order-lines",
      selectedLink?.purchaseOrder.type,
      purchaseOrderId,
    ],
    queryFn: async () => {
      const path =
        selectedLink?.purchaseOrder.type === "stock"
          ? `/api/stock-orders/${purchaseOrderId}/lines`
          : `/api/purchase-orders/${purchaseOrderId}/lines`;
      const { data } = await api.get<PoLineRow[]>(path);
      return data;
    },
    enabled: open && !!purchaseOrderId && !!selectedLink,
  });

  const lineOptions = useMemo(() => {
    return lines
      .filter((line) => !allocatedLineIds.has(line.id))
      .map((line) => ({ line, remaining: lineRemaining(line) }))
      .filter((row) => row.remaining > 0)
      .map((row) => ({
        value: row.line.id,
        label: `${row.line.product.name} x ${row.remaining}`,
        remaining: row.remaining,
      }));
  }, [lines, allocatedLineIds]);

  const selectedLine = lineOptions.find((line) => line.value === lineId);
  const maxQuantity = selectedLine?.remaining ?? 1;

  const mfrItems = useMemo(
    () =>
      mo.manufacturers.map((m: MoManufacturerPivot) => ({
        value: m.manufacturerId,
        label: m.manufacturer.name,
      })),
    [mo.manufacturers],
  );

  useEffect(() => {
    if (!open) {
      setPurchaseOrderId("");
      setLineId("");
      setManufacturerId("");
      setQuantity(1);
    }
  }, [open]);

  useEffect(() => {
    setLineId("");
    setQuantity(1);
  }, [purchaseOrderId]);

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(maxQuantity, current)));
  }, [maxQuantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add line allocation</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!purchaseOrderId || !lineId || !manufacturerId) return;
            setSubmitting(true);
            try {
              await onSubmit({
                purchaseOrderLineId: lineId,
                manufacturerId,
                quantity,
                verified: false,
              });
              onOpenChange(false);
            } catch {
              // parent toasts
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label required>Order</Label>
            <Select
              value={purchaseOrderId}
              items={poItems}
              disabled={submitting || poItems.length === 0}
              onValueChange={(v) => {
                if (v) setPurchaseOrderId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select linked PO or stock order" />
              </SelectTrigger>
              <SelectContent>
                {mo.purchaseOrders.map((r) => (
                  <SelectItem key={r.purchaseOrder.id} value={r.purchaseOrder.id}>
                    {r.purchaseOrder.type === "stock" ? "SO" : "PO"} #{r.purchaseOrder.number} ·{" "}
                    {r.purchaseOrder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label required>Line</Label>
            <Select
              value={lineId}
              items={lineOptions}
              disabled={submitting || !purchaseOrderId || isFetching}
              onValueChange={(v) => {
                if (v) setLineId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !purchaseOrderId
                      ? "Select order first"
                      : isFetching
                        ? "Loading lines…"
                        : "Select line"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {lineOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label required>Manufacturer</Label>
            <Select
              value={manufacturerId}
              items={mfrItems}
              disabled={submitting || mfrItems.length === 0}
              onValueChange={(v) => {
                if (v) setManufacturerId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Manufacturer on this MO" />
              </SelectTrigger>
              <SelectContent>
                {mo.manufacturers.map((m) => (
                  <SelectItem key={m.manufacturerId} value={m.manufacturerId}>
                    {m.manufacturer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mo-line-quantity" required>
              Quantity
            </Label>
            <Input
              id="mo-line-quantity"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              disabled={submitting || !lineId}
              onChange={(event) => {
                setQuantity(Math.max(1, Math.min(maxQuantity, Number(event.target.value) || 1)));
              }}
            />
          </div>
          <DialogFooter className="border-0 bg-transparent">
            <Button
              type="submit"
              disabled={submitting || !purchaseOrderId || !lineId || !manufacturerId}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
