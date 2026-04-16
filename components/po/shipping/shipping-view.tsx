"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  shippingTypeLabels,
  type ShippingType,
} from "@/lib/shipping";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShippingTable } from "./shipping-table";
import { ShippingUpsertDialog } from "./shipping-upsert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm-provider";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { ShippingRow } from "@/lib/types/api";
import { invalidateShippingRelatedQueries } from "./query-utils";

const shippingCountStatuses = new Set(["pending", "in_transit"]);

export function ShippingView() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<ShippingType>("manufacturing_order");
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: shippings, isPending } = useQuery({
    queryKey: ["shipping", activeTab],
    queryFn: async () => {
      const { data } = await api.get<ShippingRow[]>(`/api/shipping?type=${activeTab}`);
      return data;
    },
  });
  const { data: shippingCounts } = useQuery({
    queryKey: ["shipping", "open-counts"],
    queryFn: async () => {
      const { data } = await api.get<ShippingRow[]>("/api/shipping");
      return data.reduce(
        (counts, shipping) => {
          if (shippingCountStatuses.has(shipping.status)) {
            counts[shipping.type] += 1;
          }
          return counts;
        },
        {
          manufacturing_order: 0,
          purchase_order: 0,
          stock_order: 0,
        } as Record<ShippingType, number>,
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/shipping/${id}`);
    },
    onSuccess: async () => {
      await invalidateShippingRelatedQueries(qc);
      toast.success("Shipping record deleted");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleEdit = (id: string) => {
    setEditingId(id);
    setUpsertOpen(true);
  };

  const handleUpsertClose = () => {
    setUpsertOpen(false);
    setEditingId(null);
  };

  const handleUpsertSuccess = () => {
    setUpsertOpen(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    void (async () => {
      const ok = await confirm({
        title: "Delete this shipping record?",
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (ok) deleteMut.mutate(id);
    })();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shipping</h1>
          <p className="text-muted-foreground">
            Manage shipping records for manufacturing orders, purchase orders, and stock orders
          </p>
        </div>
        <Button onClick={() => setUpsertOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Shipping
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <TabsList
            variant="line"
            className="h-auto min-h-12 w-full justify-start gap-8 rounded-none border-0 border-b border-border bg-muted/30 px-4"
          >
            {Object.entries(shippingTypeLabels).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-0 bg-transparent px-0 py-3 shadow-none data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
              >
                <span className="inline-flex items-center gap-2">
                  {label}
                  {(shippingCounts?.[value as ShippingType] ?? 0) > 0 ? (
                    <Badge
                      variant={activeTab === value ? "default" : "secondary"}
                      className="h-5 min-w-5 shrink-0 justify-center px-1.5 tabular-nums text-[10px] font-semibold"
                    >
                      {shippingCounts?.[value as ShippingType]}
                    </Badge>
                  ) : null}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={activeTab} className="mt-0 outline-none">
            <div className="p-5 pt-4">
              <ShippingTable
                shippings={shippings || []}
                isPending={isPending}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ShippingUpsertDialog
        open={upsertOpen}
        onOpenChange={handleUpsertClose}
        editingId={editingId}
        defaultType={activeTab}
        onSuccess={handleUpsertSuccess}
      />
    </div>
  );
}
