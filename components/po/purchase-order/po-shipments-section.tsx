"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useConfirm } from "@/components/confirm-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import type { PoShippingRow } from "@/lib/types/api";
import { shippingStatusLabels, statusBadgeClassName } from "@/lib/po/status-labels";
import type { ShippingType } from "@/lib/shipping";
import { ShippingUpsertDialog } from "@/components/po/shipping/shipping-upsert-dialog";
import { invalidateShippingRelatedQueries } from "@/components/po/shipping/query-utils";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  shippings: PoShippingRow[];
  orderType: ShippingType;
  orderId: string;
  /** Hide title row and Add button when the parent supplies them (e.g. collapsible header). */
  hideToolbar?: boolean;
};

export function PoShipmentsSection({
  shippings,
  orderType,
  orderId,
  hideToolbar = false,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (shippingId: string) => {
      await api.delete(`/api/shipping/${shippingId}`);
    },
    onSuccess: async () => {
      await invalidateShippingRelatedQueries(qc);
      toast.success("Shipment deleted");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const requiredManufacturingOrderIds =
    orderType === "manufacturing_order" ? [orderId] : [];
  const requiredPurchaseOrderIds =
    orderType === "purchase_order" || orderType === "stock_order" ? [orderId] : [];

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
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingId(null);
              setUpsertOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add shipment
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingId(null);
              setUpsertOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add shipment
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {shippings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No shipments yet. Use <span className="font-medium text-foreground">Add shipment</span>{" "}
            when you send or receive tracking.
          </p>
        ) : (
          shippings.map((shipping) => (
            <Card key={shipping.id} className="border-border/80">
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono font-medium">{shipping.trackingNumber}</p>
                      <Badge variant="secondary" className={statusBadgeClassName(shipping.status)}>
                        {shippingStatusLabels[shipping.status] ?? shipping.status}
                      </Badge>
                      {shipping.logisticsPartner ? (
                        <Badge variant="outline">{shipping.logisticsPartner.name}</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      {shipping.shippedAt
                        ? new Date(shipping.shippedAt).toLocaleString()
                        : "Not shipped"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {shipping.trackingLink ? (
                        <a
                          href={shipping.trackingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          Track shipment
                        </a>
                      ) : null}
                      {shipping.invoiceDocumentKey ? (
                        <StorageObjectLink
                          reference={shipping.invoiceDocumentKey}
                          label="Open document"
                        />
                      ) : null}
                    </div>
                    {shipping.notes ? (
                      <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        {shipping.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingId(shipping.id);
                        setUpsertOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: "Delete this shipment?",
                            confirmLabel: "Delete",
                            variant: "destructive",
                          });
                          if (ok) deleteMut.mutate(shipping.id);
                        })();
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <ShippingUpsertDialog
        open={upsertOpen}
        onOpenChange={(open) => {
          setUpsertOpen(open);
          if (!open) setEditingId(null);
        }}
        editingId={editingId}
        defaultType={orderType}
        requiredManufacturingOrderIds={requiredManufacturingOrderIds}
        requiredPurchaseOrderIds={requiredPurchaseOrderIds}
        onSuccess={() => {
          setUpsertOpen(false);
          setEditingId(null);
        }}
      />
    </section>
  );
}
