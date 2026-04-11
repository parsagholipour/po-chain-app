"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { shippingCreateSchema } from "@/lib/validations/shipping";
import { uploadFileToStorage } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  logisticsPartnerTypeForShippingType,
  logisticsPartnerTypeLabels,
  shippingTypeLabels,
} from "@/lib/shipping";
import { DialogFooter } from "@/components/ui/dialog";
import { shippingStatusLabels } from "@/lib/po/status-labels";
import { Checkbox } from "@/components/ui/checkbox";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import { toast } from "sonner";

export type ShippingFormValues = z.infer<typeof shippingCreateSchema>;

type OrderOption = { id: string; number: number; name: string };
type LogisticsPartnerOption = {
  id: string;
  name: string;
  type: "freight_forwarder" | "carrier";
};

interface ShippingFormProps {
  defaultValues?: Partial<ShippingFormValues>;
  onSubmit: (values: ShippingFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
  availableManufacturingOrders?: OrderOption[];
  availablePurchaseOrders?: OrderOption[];
  availableLogisticsPartners?: LogisticsPartnerOption[];
  requiredManufacturingOrderIds?: string[];
  requiredPurchaseOrderIds?: string[];
}

const NO_PARTNER_VALUE = "__none__";
const shippingTypeSelectItems = Object.entries(shippingTypeLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);
const shippingStatusSelectItems = Object.entries(shippingStatusLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ShippingForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
  availableManufacturingOrders = [],
  availablePurchaseOrders = [],
  availableLogisticsPartners = [],
  requiredManufacturingOrderIds = [],
  requiredPurchaseOrderIds = [],
}: ShippingFormProps) {
  const invoiceDocumentInputRef = useRef<HTMLInputElement>(null);
  const [invoiceDocumentFile, setInvoiceDocumentFile] = useState<File | null>(null);
  const [removeStoredInvoiceDocument, setRemoveStoredInvoiceDocument] = useState(false);

  const form = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingCreateSchema) as Resolver<ShippingFormValues>,
    defaultValues: {
      type: defaultValues?.type ?? "manufacturing_order",
      status: defaultValues?.status ?? "pending",
      trackingNumber: defaultValues?.trackingNumber ?? "",
      shippedAt: defaultValues?.shippedAt ?? null,
      trackingLink: defaultValues?.trackingLink ?? "",
      notes: defaultValues?.notes ?? "",
      invoiceDocumentKey: defaultValues?.invoiceDocumentKey ?? null,
      logisticsPartnerId: defaultValues?.logisticsPartnerId ?? null,
      manufacturingOrderIds: uniqueIds([
        ...(defaultValues?.manufacturingOrderIds ?? []),
        ...requiredManufacturingOrderIds,
      ]),
      purchaseOrderIds: uniqueIds([
        ...(defaultValues?.purchaseOrderIds ?? []),
        ...requiredPurchaseOrderIds,
      ]),
    },
  });

  const type =
    useWatch({ control: form.control, name: "type" }) ??
    defaultValues?.type ??
    "manufacturing_order";
  const status =
    useWatch({ control: form.control, name: "status" }) ??
    defaultValues?.status ??
    "pending";
  const logisticsPartnerId =
    useWatch({ control: form.control, name: "logisticsPartnerId" }) ??
    NO_PARTNER_VALUE;
  const shippedAt = useWatch({ control: form.control, name: "shippedAt" }) ?? null;
  const selectedManufacturingOrderIds =
    useWatch({ control: form.control, name: "manufacturingOrderIds" }) ?? [];
  const selectedPurchaseOrderIds =
    useWatch({ control: form.control, name: "purchaseOrderIds" }) ?? [];

  const storedInvoiceDocumentKey =
    removeStoredInvoiceDocument || invoiceDocumentFile
      ? null
      : (defaultValues?.invoiceDocumentKey ?? null);

  const partnerLabel =
    logisticsPartnerTypeLabels[logisticsPartnerTypeForShippingType(type)];
  const logisticsPartnerSelectItems = [
    {
      value: NO_PARTNER_VALUE,
      label: `No ${partnerLabel.toLowerCase()}`,
    },
    ...availableLogisticsPartners.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })),
  ];

  function toggleIds(
    currentIds: string[],
    targetId: string,
    checked: boolean,
    requiredIds: string[],
  ) {
    if (requiredIds.includes(targetId)) {
      return uniqueIds([...currentIds, targetId]);
    }
    return checked
      ? uniqueIds([...currentIds, targetId])
      : currentIds.filter((id) => id !== targetId);
  }

  async function handleSubmit(values: ShippingFormValues) {
    let invoiceDocumentKey = defaultValues?.invoiceDocumentKey ?? null;
    if (invoiceDocumentFile) {
      try {
        invoiceDocumentKey = await uploadFileToStorage(invoiceDocumentFile, "shippings");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredInvoiceDocument) {
      invoiceDocumentKey = null;
    }

    await onSubmit({
      ...values,
      invoiceDocumentKey,
      manufacturingOrderIds: uniqueIds([
        ...(values.manufacturingOrderIds ?? []),
        ...requiredManufacturingOrderIds,
      ]),
      purchaseOrderIds: uniqueIds([
        ...(values.purchaseOrderIds ?? []),
        ...requiredPurchaseOrderIds,
      ]),
    });
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <FieldSet>
        <Field>
          <FieldLabel>Type</FieldLabel>
          <FieldContent>
            <Select
              value={type}
              items={shippingTypeSelectItems}
              onValueChange={(value) =>
                form.setValue("type", value as ShippingFormValues["type"])
              }
              disabled={!!defaultValues?.type}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(shippingTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
          <FieldError>{form.formState.errors.type?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Status</FieldLabel>
          <FieldContent>
            <Select
              value={status}
              items={shippingStatusSelectItems}
              onValueChange={(value) =>
                form.setValue("status", value as ShippingFormValues["status"])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(shippingStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
          <FieldError>{form.formState.errors.status?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{partnerLabel}</FieldLabel>
          <FieldContent>
            <Select
              value={logisticsPartnerId}
              items={logisticsPartnerSelectItems}
              onValueChange={(value) =>
                form.setValue(
                  "logisticsPartnerId",
                  value === NO_PARTNER_VALUE ? null : value,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${partnerLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARTNER_VALUE}>No {partnerLabel.toLowerCase()}</SelectItem>
                {availableLogisticsPartners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
          <FieldError>{form.formState.errors.logisticsPartnerId?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Tracking Number</FieldLabel>
          <FieldContent>
            <Input {...form.register("trackingNumber")} placeholder="Tracking number" />
          </FieldContent>
          <FieldError>{form.formState.errors.trackingNumber?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Shipped At</FieldLabel>
          <FieldContent>
            <Input
              type="datetime-local"
              value={formatDateTimeLocal(shippedAt)}
              onChange={(event) =>
                form.setValue("shippedAt", event.target.value || null, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </FieldContent>
          <FieldError>{form.formState.errors.shippedAt?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Tracking Link</FieldLabel>
          <FieldContent>
            <Input {...form.register("trackingLink")} placeholder="https://..." />
          </FieldContent>
          <FieldError>{form.formState.errors.trackingLink?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Notes</FieldLabel>
          <FieldContent>
            <Textarea
              {...form.register("notes")}
              placeholder="Delivery notes, contact details, customs notes..."
              rows={4}
            />
          </FieldContent>
          <FieldError>{form.formState.errors.notes?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Shipping Document</FieldLabel>
          <FieldContent>
            <Input
              ref={invoiceDocumentInputRef}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setInvoiceDocumentFile(file);
                if (file) setRemoveStoredInvoiceDocument(false);
              }}
            />
            {invoiceDocumentFile ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{invoiceDocumentFile.name}</span>
              </p>
            ) : storedInvoiceDocumentKey ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <StorageObjectLink reference={storedInvoiceDocumentKey} label="Open document" />
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {storedInvoiceDocumentKey && !invoiceDocumentFile && !removeStoredInvoiceDocument ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRemoveStoredInvoiceDocument(true);
                    if (invoiceDocumentInputRef.current) {
                      invoiceDocumentInputRef.current.value = "";
                    }
                  }}
                >
                  Remove document
                </Button>
              ) : null}
              {invoiceDocumentFile ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setInvoiceDocumentFile(null);
                    if (invoiceDocumentInputRef.current) {
                      invoiceDocumentInputRef.current.value = "";
                    }
                  }}
                >
                  Clear new file
                </Button>
              ) : null}
            </div>
          </FieldContent>
          <FieldError>{form.formState.errors.invoiceDocumentKey?.message}</FieldError>
        </Field>

        {type === "manufacturing_order" ? (
          <Field>
            <FieldLabel>Manufacturing Orders</FieldLabel>
            <FieldContent>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                {availableManufacturingOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders available</p>
                ) : (
                  availableManufacturingOrders.map((order) => {
                    const isRequired = requiredManufacturingOrderIds.includes(order.id);
                    const checked = selectedManufacturingOrderIds.includes(order.id) || isRequired;

                    return (
                      <div key={order.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`mo-${order.id}`}
                          checked={checked}
                          disabled={isRequired}
                          onCheckedChange={(checkedValue) => {
                            form.setValue(
                              "manufacturingOrderIds",
                              toggleIds(
                                selectedManufacturingOrderIds,
                                order.id,
                                checkedValue === true,
                                requiredManufacturingOrderIds,
                              ),
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                        />
                        <label htmlFor={`mo-${order.id}`} className="cursor-pointer text-sm">
                          #{order.number} - {order.name}
                          {isRequired ? " (Current order)" : ""}
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </FieldContent>
            <FieldError>{form.formState.errors.manufacturingOrderIds?.message}</FieldError>
          </Field>
        ) : (
          <Field>
            <FieldLabel>{type === "stock_order" ? "Stock Orders" : "Purchase Orders"}</FieldLabel>
            <FieldContent>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                {availablePurchaseOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders available</p>
                ) : (
                  availablePurchaseOrders.map((order) => {
                    const isRequired = requiredPurchaseOrderIds.includes(order.id);
                    const checked = selectedPurchaseOrderIds.includes(order.id) || isRequired;

                    return (
                      <div key={order.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`po-${order.id}`}
                          checked={checked}
                          disabled={isRequired}
                          onCheckedChange={(checkedValue) => {
                            form.setValue(
                              "purchaseOrderIds",
                              toggleIds(
                                selectedPurchaseOrderIds,
                                order.id,
                                checkedValue === true,
                                requiredPurchaseOrderIds,
                              ),
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
                        />
                        <label htmlFor={`po-${order.id}`} className="cursor-pointer text-sm">
                          #{order.number} - {order.name}
                          {isRequired ? " (Current order)" : ""}
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </FieldContent>
            <FieldError>{form.formState.errors.purchaseOrderIds?.message}</FieldError>
          </Field>
        )}
      </FieldSet>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
