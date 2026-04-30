"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
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
    verified?: boolean;
  }) => Promise<void>;
};

export function AddMoLineAllocationDialog({
  open,
  onOpenChange,
  mo,
  onSubmit,
}: Props) {
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [lineId, setLineId] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
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
      .filter((l) => !allocatedLineIds.has(l.id))
      .map((l) => ({
        value: l.id,
        label: `${l.product.name} × ${l.quantity}`,
      }));
  }, [lines, allocatedLineIds]);

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
    }
  }, [open]);

  useEffect(() => {
    setLineId("");
  }, [purchaseOrderId]);

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
