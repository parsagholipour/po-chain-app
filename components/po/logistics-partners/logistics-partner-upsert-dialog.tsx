"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { LogisticsPartner } from "@/lib/types/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogisticsPartnerForm } from "./logistics-partner-form";
import type { LogisticsPartnerFormValues } from "./logistics-partner-form";
import { toast } from "sonner";
import { invalidateLogisticsPartnerQueries } from "@/components/po/shipping/query-utils";
import {
  logisticsPartnerTypeLabels,
  type LogisticsPartnerType,
} from "@/lib/shipping";

interface LogisticsPartnerUpsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LogisticsPartner | null;
  defaultType?: LogisticsPartnerType;
  onSuccess: () => void;
}

export function LogisticsPartnerUpsertDialog({
  open,
  onOpenChange,
  editing,
  defaultType = "freight_forwarder",
  onSuccess,
}: LogisticsPartnerUpsertDialogProps) {
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: async (values: LogisticsPartnerFormValues) => {
      const { data: row } = await api.post<LogisticsPartner>("/api/logistics-partners", values);
      return row;
    },
    onSuccess: async () => {
      await invalidateLogisticsPartnerQueries(qc);
      toast.success("Logistics partner created");
      onSuccess();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: LogisticsPartnerFormValues }) => {
      const { data: row } = await api.patch<LogisticsPartner>(
        `/api/logistics-partners/${id}`,
        values,
      );
      return row;
    },
    onSuccess: async () => {
      await invalidateLogisticsPartnerQueries(qc);
      toast.success("Logistics partner updated");
      onSuccess();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleSubmit = async (values: LogisticsPartnerFormValues): Promise<string> => {
    if (editing) {
      const row = await updateMut.mutateAsync({ id: editing.id, values });
      return row.id;
    } else {
      const row = await createMut.mutateAsync(values);
      return row.id;
    }
  };

  const isSubmitting = createMut.isPending || updateMut.isPending;
  const formKey = editing
    ? `edit-${editing.id}`
    : `create-${defaultType}-${open ? "open" : "closed"}`;
  const partnerTypeLabel = logisticsPartnerTypeLabels[editing?.type ?? defaultType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${partnerTypeLabel}` : `Add ${partnerTypeLabel}`}
          </DialogTitle>
        </DialogHeader>
        <LogisticsPartnerForm
          key={formKey}
          defaultValues={editing || undefined}
          editingId={editing?.id}
          defaultType={editing?.type ?? defaultType}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
