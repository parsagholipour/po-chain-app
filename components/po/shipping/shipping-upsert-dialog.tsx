"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  OrderStatusLog,
  SaleChannelLocationRef,
  ShippingRow,
  WarehouseOrderSummary,
} from "@/lib/types/api";
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
  isBackOrder?: boolean;
  saleChannel?: { id: string; name: string; type: string; logoKey: string | null } | null;
  saleChannelLocation?: ShippingRow["saleChannelLocation"] | null;
  shipToLocationName?: string | null;
  shipToRecipientName?: string | null;
  shipToCompanyName?: string | null;
  shipToPhoneNumber?: string | null;
  shipToEmail?: string | null;
  shipToAddressLine1?: string | null;
  shipToAddressLine2?: string | null;
  shipToCity?: string | null;
  shipToStateProvince?: string | null;
  shipToPostalCode?: string | null;
  shipToCountry?: string | null;
  shipToNotes?: string | null;
  linkedSaleChannels?: string[];
};
type SaleChannelLocationOption = SaleChannelLocationRef;

interface ShippingUpsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  defaultType?: ShippingType;
  requiredManufacturingOrderIds?: string[];
  requiredPurchaseOrderIds?: string[];
  requiredWarehouseOrderIds?: string[];
  onSuccess: () => void;
}

export function ShippingUpsertDialog({
  open,
  onOpenChange,
  editingId,
  defaultType = "manufacturing_order",
  requiredManufacturingOrderIds = [],
  requiredPurchaseOrderIds = [],
  requiredWarehouseOrderIds = [],
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

  const { data: warehouseOrders, isPending: isWarehouseOrdersPending } = useQuery({
    queryKey: ["warehouse-orders", "shipping-form"],
    queryFn: async () => {
      const { data } = await api.get<WarehouseOrderSummary[]>("/api/warehouse-orders");
      return data.map((row) => ({
        id: row.id,
        number: row.number,
        name: row.name,
      }));
    },
    enabled: open && currentType === "warehouse_order",
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

  const saveStatusLogNoteMut = useMutation({
    mutationFn: async ({
      logId,
      note,
    }: {
      logId: string;
      note: string | null;
    }) => {
      const { data } = await api.patch<OrderStatusLog>(`/api/order-status-logs/${logId}`, {
        note,
      });
      return data;
    },
    onSuccess: (updatedLog) => {
      if (!editingId) return;
      qc.setQueryData<ShippingRow | undefined>(["shipping", editingId], (current) =>
        current
          ? {
              ...current,
              statusLogs: current.statusLogs.map((log) =>
                log.id === updatedLog.id ? updatedLog : log,
              ),
            }
          : current,
      );
      toast.success("Note saved");
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

  const availablePurchaseOrders = useMemo(
    () =>
      currentType === "stock_order"
        ? stockOrders ?? []
        : (purchaseOrders ?? []).filter((order) => !order.isBackOrder),
    [currentType, purchaseOrders, stockOrders],
  );
  const saleChannelIdsForLocations = useMemo(() => {
    if (currentType !== "purchase_order" && currentType !== "stock_order") return [];
    return [
      ...new Set(
        availablePurchaseOrders
          .map((order) => order.saleChannel?.id ?? order.saleChannelLocation?.saleChannelId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].sort();
  }, [availablePurchaseOrders, currentType]);

  const {
    data: fetchedSaleChannelLocations = [],
    isPending: isSaleChannelLocationsPending,
  } = useQuery({
    queryKey: ["sale-channel-locations", "shipping-form", saleChannelIdsForLocations],
    queryFn: async () => {
      const results = await Promise.all(
        saleChannelIdsForLocations.map(async (saleChannelId) => {
          const { data } = await api.get<SaleChannelLocationOption[]>(
            `/api/sale-channels/${saleChannelId}/locations`,
          );
          return data;
        }),
      );
      return results.flat();
    },
    enabled:
      open &&
      saleChannelIdsForLocations.length > 0 &&
      (currentType === "purchase_order" || currentType === "stock_order"),
  });

  const availableSaleChannelLocations = useMemo(() => {
    const byId = new Map<string, SaleChannelLocationOption>();
    for (const order of availablePurchaseOrders) {
      if (order.saleChannelLocation) {
        byId.set(order.saleChannelLocation.id, order.saleChannelLocation);
      }
    }
    if (shipping?.saleChannelLocation) {
      byId.set(shipping.saleChannelLocation.id, shipping.saleChannelLocation);
    }
    for (const location of fetchedSaleChannelLocations) {
      byId.set(location.id, location);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePurchaseOrders, fetchedSaleChannelLocations, shipping]);

  const isOrderOptionsPending =
    currentType === "manufacturing_order"
      ? isManufacturingOrdersPending
      : currentType === "warehouse_order"
        ? isWarehouseOrdersPending
      : currentType === "stock_order"
        ? isStockOrdersPending
        : isPurchaseOrdersPending;
  const isDestinationLocationsPending =
    (currentType === "purchase_order" || currentType === "stock_order") &&
    saleChannelIdsForLocations.length > 0 &&
    isSaleChannelLocationsPending;
  const isEditFormLoading =
    isEditing &&
    (isShippingPending ||
      isOrderOptionsPending ||
      isLogisticsPartnersPending ||
      isDestinationLocationsPending);
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
        saleChannelLocationId: shipping.saleChannelLocationId,
        shipToLocationName: shipping.shipToLocationName,
        shipToRecipientName: shipping.shipToRecipientName,
        shipToCompanyName: shipping.shipToCompanyName,
        shipToPhoneNumber: shipping.shipToPhoneNumber,
        shipToEmail: shipping.shipToEmail,
        shipToAddressLine1: shipping.shipToAddressLine1,
        shipToAddressLine2: shipping.shipToAddressLine2,
        shipToCity: shipping.shipToCity,
        shipToStateProvince: shipping.shipToStateProvince,
        shipToPostalCode: shipping.shipToPostalCode,
        shipToCountry: shipping.shipToCountry,
        shipToNotes: shipping.shipToNotes,
        manufacturingOrderIds: shipping.orders
          .filter((o) => o.orderType === "manufacturing_order")
          .map((o) => o.id),
        purchaseOrderIds: shipping.orders
          .filter((o) => o.orderType === "purchase_order" || o.orderType === "stock_order")
          .map((o) => o.id),
        warehouseOrderIds: shipping.orders
          .filter((o) => o.orderType === "warehouse_order")
          .map((o) => o.id),
      }
    : {
        type: defaultType,
        cost: null,
        deliveryDutiesPaid: false,
        manufacturingOrderIds: requiredManufacturingOrderIds,
        purchaseOrderIds: requiredPurchaseOrderIds,
        warehouseOrderIds: requiredWarehouseOrderIds,
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
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
            onSaveStatusLogNote={async (logId, note) => {
              await saveStatusLogNoteMut.mutateAsync({ logId, note });
            }}
            isSubmitting={isSubmitting}
            availableManufacturingOrders={manufacturingOrders ?? []}
            availablePurchaseOrders={availablePurchaseOrders}
            availableWarehouseOrders={warehouseOrders ?? []}
            availableSaleChannelLocations={availableSaleChannelLocations}
            availableLogisticsPartners={logisticsPartners}
            requiredManufacturingOrderIds={requiredManufacturingOrderIds}
            requiredPurchaseOrderIds={requiredPurchaseOrderIds}
            requiredWarehouseOrderIds={requiredWarehouseOrderIds}
            isSaleChannelLocationsPending={isDestinationLocationsPending}
            statusLogs={shipping?.statusLogs ?? []}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
