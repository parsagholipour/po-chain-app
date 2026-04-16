"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { LogisticsPartner } from "@/lib/types/api";
import { LogisticsPartnersTable } from "./logistics-partners-table";
import { LogisticsPartnerUpsertDialog } from "./logistics-partner-upsert-dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  logisticsPartnerTypeLabels,
  type LogisticsPartnerType,
} from "@/lib/shipping";
import { invalidateLogisticsPartnerQueries } from "@/components/po/shipping/query-utils";

export type { LogisticsPartner } from "@/lib/types/api";

const logisticsPartnersKey = ["logistics-partners"] as const;

export function LogisticsPartnersView() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<LogisticsPartnerType>("freight_forwarder");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LogisticsPartner | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: [...logisticsPartnersKey, activeTab],
    queryFn: async () => {
      const { data: rows } = await api.get<LogisticsPartner[]>(
        `/api/logistics-partners?type=${activeTab}`,
      );
      return rows;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/logistics-partners/${id}`);
    },
    onSuccess: async () => {
      await invalidateLogisticsPartnerQueries(qc);
      toast.success("Logistics partner deleted");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleEdit = (partner: LogisticsPartner) => {
    setEditing(partner);
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    void (async () => {
      const ok = await confirm({
        title: "Delete this logistics partner?",
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (ok) deleteMut.mutate(id);
    })();
  };

  const handleUpsertClose = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleUpsertSuccess = () => {
    setOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logistics Partners</h1>
          <p className="text-muted-foreground">
            Manage freight forwarders and carriers for shipping
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add {logisticsPartnerTypeLabels[activeTab]}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as LogisticsPartnerType)}
          className="gap-0"
        >
          <TabsList
            variant="line"
            className="h-auto min-h-12 w-full justify-start gap-8 rounded-none border-0 border-b border-border bg-muted/30 px-4"
          >
            {Object.entries(logisticsPartnerTypeLabels).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-0 bg-transparent px-0 py-3 shadow-none data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
              >
                {label}s
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={activeTab} className="mt-0 outline-none">
            <div className="p-5 pt-4">
              <LogisticsPartnersTable
                partners={data}
                isPending={isPending}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <LogisticsPartnerUpsertDialog
        open={open}
        onOpenChange={handleUpsertClose}
        editing={editing}
        defaultType={activeTab}
        onSuccess={handleUpsertSuccess}
      />
    </div>
  );
}
