"use client";

import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PoShippingRow } from "@/lib/types/api";
import { Plus, Trash2 } from "lucide-react";
import { ShipDocLink } from "./ship-doc-link";

type Props = {
  shippings: PoShippingRow[];
  onAdd: () => void;
  onDelete: (shippingId: string) => void;
  /** Hide title row and Add button when the parent supplies them (e.g. collapsible header). */
  hideToolbar?: boolean;
};

export function PoShipmentsSection({ shippings, onAdd, onDelete, hideToolbar = false }: Props) {
  const confirm = useConfirm();

  return (
    <section
      className="space-y-4"
      aria-labelledby={hideToolbar ? undefined : "po-shipments-heading"}
      aria-label={hideToolbar ? "Shipments" : undefined}
    >
      {!hideToolbar ? (
        <div className="flex items-center justify-between gap-4">
          <h2 id="po-shipments-heading" className="text-lg font-semibold">
            Shipments
          </h2>
          <Button type="button" size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            Add shipment
          </Button>
        </div>
      ) : null}
      <div className="space-y-3">
        {shippings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No shipments yet. Use <span className="font-medium text-foreground">Add shipment</span>{" "}
            when you send or receive tracking.
          </p>
        ) : (
          shippings.map((s) => (
            <Card key={s.id} className="border-border/80">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4">
                <div className="text-sm">
                  <p className="font-mono font-medium">{s.trackingNumber}</p>
                  <p className="text-muted-foreground">
                    {new Date(s.shippedAt).toLocaleString()}
                  </p>
                  {s.invoiceDocumentKey ? <ShipDocLink docKey={s.invoiceDocumentKey} /> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: "Delete this shipment?",
                        confirmLabel: "Delete",
                        variant: "destructive",
                      });
                      if (ok) onDelete(s.id);
                    })();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
