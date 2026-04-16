"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { ShippingRow } from "@/lib/types/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShippingForm, type ShippingFormValues } from "./shipping-form";
import { toast } from "sonner";
import { invalidateShippingRelatedQueries } from "./query-utils";
import {
  logisticsPartnerTypeForShippingType,
  type LogisticsPartnerType,
  type ShippingType,
} from "@/lib/shipping";

type OrderOption = {
  id: string;
  number: number;
  name: string;
  linkedSaleChannels?: string[];
};

interface ShippingUpsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  defaultType?: ShippingType;
  requiredManufacturingOrderIds?: string[];
  requiredPurchaseOrderIds?: string[];
  onSuccess: () => void;
}

export function ShippingUpsertDialog({
  open,
  onOpenChange,
  editingId,
  defaultType = "manufacturing_order",
  requiredManufacturingOrderIds = [],
  requiredPurchaseOrderIds = [],
  onSuccess,
}: ShippingUpsertDialogProps) {
  const qc = useQueryClient();
  const isEditing = !!editingId;

  const { data: shipping, isPending: isShippingPending } = useQuery({
    queryKey: ["shipping", editingId],
    queryFn: async () => {
      const { data } = await api.get<ShippingRow>(`/api/shipping/${editingId}`);
      return data;
    },
    enabled: isEditing && open,
  });

  const currentType = shipping?.type ?? defaultType;

  const { data: manufacturingOrders, isPending: isManufacturingOrdersPending } = useQuery({
    queryKey: ["manufacturing-orders"],
    queryFn: async () => {
      const { data } = await api.get<OrderOption[]>("/api/manufacturing-orders");
      return data;
    },
    enabled: open && currentType === "manufacturing_order",
  });

  const { data: purchaseOrders, isPending: isPurchaseOrdersPending } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data } = await api.get<OrderOption[]>("/api/purchase-orders");
      return data;
    },
    enabled: open && currentType === "purchase_order",
  });

  const { data: stockOrders, isPending: isStockOrdersPending } = useQuery({
    queryKey: ["stock-orders"],
    queryFn: async () => {
      const { data } = await api.get<OrderOption[]>("/api/stock-orders");
      return data;
    },
    enabled: open && currentType === "stock_order",
  });

  const {
    data: logisticsPartners = [],
    isPending: isLogisticsPartnersPending,
  } = useQuery({
    queryKey: [
      "logistics-partners",
      "shipping-form",
      logisticsPartnerTypeForShippingType(currentType),
    ],
    queryFn: async () => {
      const partnerType = logisticsPartnerTypeForShippingType(currentType);
      const { data } = await api.get<
        {
          id: string;
          name: string;
          type: LogisticsPartnerType;
        }[]
      >(`/api/logistics-partners?type=${partnerType}`);
      return data;
    },
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: async (values: ShippingFormValues) => {
      const { data: row } = await api.post<ShippingRow>("/api/shipping", values);
      return row;
    },
    onSuccess: async () => {
      await invalidateShippingRelatedQueries(qc);
      toast.success("Shipping record created");
      onSuccess();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ShippingFormValues }) => {
      const { data: row } = await api.patch<ShippingRow>(`/api/shipping/${id}`, values);
      return row;
    },
    onSuccess: async () => {
      await invalidateShippingRelatedQueries(qc);
      toast.success("Shipping record updated");
      onSuccess();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleSubmit = async (values: ShippingFormValues): Promise<string> => {
    if (editingId) {
      const row = await updateMut.mutateAsync({ id: editingId, values });
      return row.id;
    } else {
      const row = await createMut.mutateAsync(values);
      return row.id;
    }
  };

  const isSubmitting = createMut.isPending || updateMut.isPending;

  const availablePurchaseOrders =
    currentType === "stock_order" ? stockOrders ?? [] : purchaseOrders ?? [];
  const isOrderOptionsPending =
    currentType === "manufacturing_order"
      ? isManufacturingOrdersPending
      : currentType === "stock_order"
        ? isStockOrdersPending
        : isPurchaseOrdersPending;
  const isEditFormLoading =
    isEditing &&
    (isShippingPending || isOrderOptionsPending || isLogisticsPartnersPending);
  const formKey = isEditing
    ? `shipping-edit-${editingId}`
    : `shipping-create-${defaultType}-${open ? "open" : "closed"}`;

  const defaultFormValues: Partial<ShippingFormValues> = shipping
    ? {
        type: shipping.type,
        status: shipping.status as ShippingFormValues["status"],
        cost: shipping.cost == null ? null : Number(shipping.cost),
        deliveryDutiesPaid: shipping.deliveryDutiesPaid,
        trackingNumber: shipping.trackingNumber,
        shippedAt: shipping.shippedAt ?? null,
        trackingLink: shipping.trackingLink,
        notes: shipping.notes,
        invoiceDocumentKey: shipping.invoiceDocumentKey,
        logisticsPartnerId: shipping.logisticsPartnerId,
        manufacturingOrderIds: shipping.orders
          .filter((o) => o.orderType === "manufacturing_order")
          .map((o) => o.id),
        purchaseOrderIds: shipping.orders
          .filter((o) => o.orderType !== "manufacturing_order")
          .map((o) => o.id),
      }
    : {
        type: defaultType,
        cost: null,
        deliveryDutiesPaid: false,
        manufacturingOrderIds: requiredManufacturingOrderIds,
        purchaseOrderIds: requiredPurchaseOrderIds,
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit Shipping Record" : "Add Shipping Record"}
          </DialogTitle>
        </DialogHeader>
        {isEditFormLoading ? (
          <div className="py-6 text-sm text-muted-foreground">
            Loading shipping record...
          </div>
        ) : isEditing && !shipping ? (
          <div className="py-6 text-sm text-destructive">
            Could not load shipping record.
          </div>
        ) : (
          <ShippingForm
            key={formKey}
            defaultValues={defaultFormValues}
            editingId={editingId}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            availableManufacturingOrders={manufacturingOrders ?? []}
            availablePurchaseOrders={availablePurchaseOrders}
            availableLogisticsPartners={logisticsPartners}
            requiredManufacturingOrderIds={requiredManufacturingOrderIds}
            requiredPurchaseOrderIds={requiredPurchaseOrderIds}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
