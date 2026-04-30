"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import {
  CustomFieldsRenderer,
  type CustomFieldsHandle,
} from "@/components/po/custom-fields/custom-fields-renderer";
import { z } from "zod";
import { shippingCreateSchema } from "@/lib/validations/shipping";
import { uploadFileToStorage } from "@/lib/upload-client";
import { OrderStatusLogsDialog } from "@/components/po/order-status-logs-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PriceField } from "@/components/ui/price-field";
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
import { cn } from "@/lib/utils";
import type { ShippingRow } from "@/lib/types/api";

export type ShippingFormValues = z.infer<typeof shippingCreateSchema>;

type OrderOption = {
  id: string;
  number: number;
  name: string;
  /** From linked POs / stock orders (manufacturing orders only). */
  linkedSaleChannels?: string[];
};
type LogisticsPartnerOption = {
  id: string;
  name: string;
  type: "freight_forwarder" | "carrier";
};

interface ShippingFormProps {
  defaultValues?: Partial<ShippingFormValues>;
  editingId?: string | null;
  onSubmit: (values: ShippingFormValues) => Promise<string>;
  onSaveStatusLogNote?: (logId: string, note: string | null) => Promise<void>;
  isSubmitting?: boolean;
  availableManufacturingOrders?: OrderOption[];
  availablePurchaseOrders?: OrderOption[];
  availableLogisticsPartners?: LogisticsPartnerOption[];
  requiredManufacturingOrderIds?: string[];
  requiredPurchaseOrderIds?: string[];
  statusLogs?: ShippingRow["statusLogs"];
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

/** Current local date/time in `datetime-local` value form (YYYY-MM-DDTHH:mm). */
function dateTimeLocalNow() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ShippingForm({
  defaultValues,
  editingId,
  onSubmit,
  onSaveStatusLogNote,
  isSubmitting = false,
  availableManufacturingOrders = [],
  availablePurchaseOrders = [],
  availableLogisticsPartners = [],
  requiredManufacturingOrderIds = [],
  requiredPurchaseOrderIds = [],
  statusLogs = [],
}: ShippingFormProps) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const invoiceDocumentInputRef = useRef<HTMLInputElement>(null);
  const [invoiceDocumentFile, setInvoiceDocumentFile] = useState<File | null>(null);
  const [removeStoredInvoiceDocument, setRemoveStoredInvoiceDocument] = useState(false);

  const form = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingCreateSchema) as Resolver<ShippingFormValues>,
    defaultValues: {
      type: defaultValues?.type ?? "manufacturing_order",
      status: defaultValues?.status ?? "pending",
      cost: defaultValues?.cost ?? null,
      deliveryDutiesPaid: defaultValues?.deliveryDutiesPaid ?? false,
      trackingNumber: defaultValues?.trackingNumber ?? "",
      shippedAt:
        defaultValues?.shippedAt !== undefined ? defaultValues.shippedAt : dateTimeLocalNow(),
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

  const allValues = useWatch({ control: form.control });

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
  const showStatusHistory = editingId != null;
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

    const entityId = await onSubmit({
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
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(handleSubmit)(event);
      }}
      className="space-y-4"
    >
      <FieldSet>
        <Field>
          <FieldLabel required>Type</FieldLabel>
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
          <div className="flex items-center gap-2">
            <FieldLabel required>Status</FieldLabel>
            {showStatusHistory ? (
              <OrderStatusLogsDialog
                title="Shipping status history"
                description="Newest first. Each entry shows when the shipping status changed and who changed it."
                logs={statusLogs}
                statusLabels={shippingStatusLabels}
                onSaveNote={onSaveStatusLogNote}
              />
            ) : null}
          </div>
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
          <FieldLabel htmlFor="sf-cost">Cost</FieldLabel>
          <FieldContent>
            <PriceField
              id="sf-cost"
              placeholder="Optional"
              {...form.register("cost", { valueAsNumber: true })}
            />
          </FieldContent>
          <FieldError>{form.formState.errors.cost?.message}</FieldError>
        </Field>

        <Field orientation="horizontal" className="gap-2">
          <Controller
            control={form.control}
            name="deliveryDutiesPaid"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                label={<span className="font-normal">Delivery duties paid (DDP)</span>}
              />
            )}
          />
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
            <Input {...form.register("trackingNumber")} placeholder="Optional" />
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

                    const moCheckboxId = `mo-${order.id}`;
                    const channelText =
                      order.linkedSaleChannels && order.linkedSaleChannels.length > 0
                        ? order.linkedSaleChannels.join(", ")
                        : null;

                    return (
                      <div
                        key={order.id}
                        className="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-0.5 sm:gap-2"
                      >
                        <label
                          className={cn(
                            "flex min-w-0 flex-1 cursor-pointer items-center gap-2",
                            "has-[[data-slot=checkbox]:disabled]:cursor-not-allowed has-[[data-slot=checkbox]:disabled]:opacity-50",
                          )}
                        >
                          <Checkbox
                            id={moCheckboxId}
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
                          <span className="shrink-0 text-sm font-medium leading-snug">
                            #{order.number} - {order.name}
                            {isRequired ? " (Current order)" : ""}
                          </span>
                          {channelText ? (
                            <span className="flex min-w-0 flex-1 items-center self-center">
                              <span
                                className="truncate text-xs leading-none text-muted-foreground"
                                title={channelText}
                              >
                                {channelText}
                              </span>
                            </span>
                          ) : null}
                        </label>
                        <Link
                          href={`/manufacturing-orders/${order.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-xs" }),
                            "shrink-0 self-center text-muted-foreground hover:text-primary",
                          )}
                          aria-label={`Open manufacturing order #${order.number} in new tab`}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
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
                          label={
                            <span className="text-sm">
                              #{order.number} - {order.name}
                              {isRequired ? " (Current order)" : ""}
                            </span>
                          }
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
                      </div>
                    );
                  })
                )}
              </div>
            </FieldContent>
            <FieldError>{form.formState.errors.purchaseOrderIds?.message}</FieldError>
          </Field>
        )}

        <CustomFieldsRenderer
          ref={customFieldsRef}
          entityType="shipping"
          entityId={editingId}
          disabled={isSubmitting}
          nativeValues={allValues as Record<string, unknown>}
        />
      </FieldSet>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
