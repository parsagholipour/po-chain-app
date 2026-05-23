"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
  FieldGroup,
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
  availableWarehouseOrders?: OrderOption[];
  availableLogisticsPartners?: LogisticsPartnerOption[];
  requiredManufacturingOrderIds?: string[];
  requiredPurchaseOrderIds?: string[];
  requiredWarehouseOrderIds?: string[];
  statusLogs?: ShippingRow["statusLogs"];
}

const NO_PARTNER_VALUE = "__none__";
const EMPTY_ID_LIST: string[] = [];
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

const destinationFieldNames = [
  "shipToLocationName",
  "shipToRecipientName",
  "shipToCompanyName",
  "shipToPhoneNumber",
  "shipToEmail",
  "shipToAddressLine1",
  "shipToAddressLine2",
  "shipToCity",
  "shipToStateProvince",
  "shipToPostalCode",
  "shipToCountry",
  "shipToNotes",
] as const satisfies readonly (keyof ShippingFormValues)[];

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

function destinationValuesFromLocation(location: NonNullable<ShippingRow["saleChannelLocation"]>) {
  return {
    saleChannelLocationId: location.id,
    shipToLocationName: location.name,
    shipToRecipientName: location.recipientName,
    shipToCompanyName: location.companyName ?? "",
    shipToPhoneNumber: location.phoneNumber ?? "",
    shipToEmail: location.email ?? "",
    shipToAddressLine1: location.addressLine1,
    shipToAddressLine2: location.addressLine2 ?? "",
    shipToCity: location.city,
    shipToStateProvince: location.stateProvince ?? "",
    shipToPostalCode: location.postalCode ?? "",
    shipToCountry: location.country,
    shipToNotes: location.shippingNotes ?? "",
  } satisfies Partial<ShippingFormValues>;
}

function destinationValuesFromOrder(order: OrderOption) {
  if (order.saleChannelLocation) {
    return destinationValuesFromLocation(order.saleChannelLocation);
  }
  if (
    !order.shipToLocationName ||
    !order.shipToRecipientName ||
    !order.shipToAddressLine1 ||
    !order.shipToCity ||
    !order.shipToCountry
  ) {
    return null;
  }

  return {
    saleChannelLocationId: null,
    shipToLocationName: order.shipToLocationName,
    shipToRecipientName: order.shipToRecipientName,
    shipToCompanyName: order.shipToCompanyName ?? "",
    shipToPhoneNumber: order.shipToPhoneNumber ?? "",
    shipToEmail: order.shipToEmail ?? "",
    shipToAddressLine1: order.shipToAddressLine1,
    shipToAddressLine2: order.shipToAddressLine2 ?? "",
    shipToCity: order.shipToCity,
    shipToStateProvince: order.shipToStateProvince ?? "",
    shipToPostalCode: order.shipToPostalCode ?? "",
    shipToCountry: order.shipToCountry,
    shipToNotes: order.shipToNotes ?? "",
  } satisfies Partial<ShippingFormValues>;
}

function destinationSignature(values: Partial<ShippingFormValues>) {
  return JSON.stringify({
    saleChannelLocationId: values.saleChannelLocationId ?? null,
    ...Object.fromEntries(destinationFieldNames.map((field) => [field, values[field] ?? ""])),
  });
}

function emptyDestinationValues() {
  return {
    saleChannelLocationId: null,
    shipToLocationName: "",
    shipToRecipientName: "",
    shipToCompanyName: "",
    shipToPhoneNumber: "",
    shipToEmail: "",
    shipToAddressLine1: "",
    shipToAddressLine2: "",
    shipToCity: "",
    shipToStateProvince: "",
    shipToPostalCode: "",
    shipToCountry: "",
    shipToNotes: "",
  } satisfies Partial<ShippingFormValues>;
}

export function ShippingForm({
  defaultValues,
  editingId,
  onSubmit,
  onSaveStatusLogNote,
  isSubmitting = false,
  availableManufacturingOrders = [],
  availablePurchaseOrders = [],
  availableWarehouseOrders = [],
  availableLogisticsPartners = [],
  requiredManufacturingOrderIds = [],
  requiredPurchaseOrderIds = [],
  requiredWarehouseOrderIds = [],
  statusLogs = [],
}: ShippingFormProps) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const invoiceDocumentInputRef = useRef<HTMLInputElement>(null);
  const [invoiceDocumentFile, setInvoiceDocumentFile] = useState<File | null>(null);
  const [removeStoredInvoiceDocument, setRemoveStoredInvoiceDocument] = useState(false);
  const [destinationTouched, setDestinationTouched] = useState(Boolean(editingId));

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
      saleChannelLocationId: defaultValues?.saleChannelLocationId ?? null,
      shipToLocationName: defaultValues?.shipToLocationName ?? "",
      shipToRecipientName: defaultValues?.shipToRecipientName ?? "",
      shipToCompanyName: defaultValues?.shipToCompanyName ?? "",
      shipToPhoneNumber: defaultValues?.shipToPhoneNumber ?? "",
      shipToEmail: defaultValues?.shipToEmail ?? "",
      shipToAddressLine1: defaultValues?.shipToAddressLine1 ?? "",
      shipToAddressLine2: defaultValues?.shipToAddressLine2 ?? "",
      shipToCity: defaultValues?.shipToCity ?? "",
      shipToStateProvince: defaultValues?.shipToStateProvince ?? "",
      shipToPostalCode: defaultValues?.shipToPostalCode ?? "",
      shipToCountry: defaultValues?.shipToCountry ?? "",
      shipToNotes: defaultValues?.shipToNotes ?? "",
      manufacturingOrderIds: uniqueIds([
        ...(defaultValues?.manufacturingOrderIds ?? []),
        ...requiredManufacturingOrderIds,
      ]),
      purchaseOrderIds: uniqueIds([
        ...(defaultValues?.purchaseOrderIds ?? []),
        ...requiredPurchaseOrderIds,
      ]),
      warehouseOrderIds: uniqueIds([
        ...(defaultValues?.warehouseOrderIds ?? []),
        ...requiredWarehouseOrderIds,
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
  const saleChannelLocationId =
    useWatch({ control: form.control, name: "saleChannelLocationId" }) ?? null;
  const shipToLocationName =
    useWatch({ control: form.control, name: "shipToLocationName" }) ?? "";
  const selectedManufacturingOrderIds =
    useWatch({ control: form.control, name: "manufacturingOrderIds" }) ?? EMPTY_ID_LIST;
  const selectedPurchaseOrderIds =
    useWatch({ control: form.control, name: "purchaseOrderIds" }) ?? EMPTY_ID_LIST;
  const selectedWarehouseOrderIds =
    useWatch({ control: form.control, name: "warehouseOrderIds" }) ?? EMPTY_ID_LIST;

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
  const showDestination = type === "purchase_order" || type === "stock_order";
  const selectedPurchaseOrders = useMemo(
    () => availablePurchaseOrders.filter((order) => selectedPurchaseOrderIds.includes(order.id)),
    [availablePurchaseOrders, selectedPurchaseOrderIds],
  );
  const selectedDestination = useMemo(() => {
    if (selectedPurchaseOrders.length === 0) return null;
    const destinations = selectedPurchaseOrders.map(destinationValuesFromOrder);
    if (destinations.some((destination) => !destination)) return null;
    const [first, ...rest] = destinations;
    if (!first) return null;
    const firstSignature = destinationSignature(first);
    return rest.every((destination) => destinationSignature(destination!) === firstSignature)
      ? first
      : null;
  }, [selectedPurchaseOrders]);

  const setDestinationValues = useCallback((values: Partial<ShippingFormValues>) => {
    form.setValue("saleChannelLocationId", values.saleChannelLocationId ?? null, {
      shouldDirty: true,
      shouldValidate: false,
    });
    for (const field of destinationFieldNames) {
      form.setValue(field, values[field] ?? "", {
        shouldDirty: true,
        shouldValidate: false,
      });
    }
  }, [form]);

  function registerDestinationField(name: (typeof destinationFieldNames)[number]) {
    const registration = form.register(name);
    return {
      ...registration,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDestinationTouched(true);
        void registration.onChange(event);
      },
    };
  }

  useEffect(() => {
    if (editingId || destinationTouched || !showDestination) return;
    if (selectedDestination) {
      setDestinationValues(selectedDestination);
    } else {
      setDestinationValues(emptyDestinationValues());
    }
  }, [
    destinationTouched,
    editingId,
    selectedDestination,
    setDestinationValues,
    showDestination,
  ]);

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

    const destinationPayload =
      values.type === "purchase_order" || values.type === "stock_order"
        ? {}
        : emptyDestinationValues();

    const entityId = await onSubmit({
      ...values,
      ...destinationPayload,
      invoiceDocumentKey,
      manufacturingOrderIds: uniqueIds([
        ...(values.manufacturingOrderIds ?? []),
        ...requiredManufacturingOrderIds,
      ]),
      purchaseOrderIds: uniqueIds([
        ...(values.purchaseOrderIds ?? []),
        ...requiredPurchaseOrderIds,
      ]),
      warehouseOrderIds: uniqueIds([
        ...(values.warehouseOrderIds ?? []),
        ...requiredWarehouseOrderIds,
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
        <FieldGroup className="grid gap-4 md:grid-cols-2">
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
              <SelectTrigger className="w-full min-w-0">
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
              <SelectTrigger className="w-full min-w-0">
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

        <Field orientation="horizontal" className="gap-2 md:self-end md:pb-1">
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
              <SelectTrigger className="w-full min-w-0">
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

        <Field className="md:col-span-2">
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

        <Field className="md:col-span-2">
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
          <Field className="md:col-span-2">
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
        ) : type === "warehouse_order" ? (
          <Field className="md:col-span-2">
            <FieldLabel>Warehouse Orders</FieldLabel>
            <FieldContent>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                {availableWarehouseOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders available</p>
                ) : (
                  availableWarehouseOrders.map((order) => {
                    const isRequired = requiredWarehouseOrderIds.includes(order.id);
                    const checked = selectedWarehouseOrderIds.includes(order.id) || isRequired;

                    return (
                      <div key={order.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`wo-${order.id}`}
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
                              "warehouseOrderIds",
                              toggleIds(
                                selectedWarehouseOrderIds,
                                order.id,
                                checkedValue === true,
                                requiredWarehouseOrderIds,
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
            <FieldError>{form.formState.errors.warehouseOrderIds?.message}</FieldError>
          </Field>
        ) : (
          <Field className="md:col-span-2">
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

        {showDestination ? (
          <div className="md:col-span-2">
            <div className="grid gap-4 rounded-lg border border-border/80 p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium">Destination</h3>
                {saleChannelLocationId || shipToLocationName ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shipToLocationName || selectedDestination?.shipToLocationName}
                  </p>
                ) : null}
              </div>
              <Field data-invalid={!!form.formState.errors.shipToRecipientName}>
                <FieldLabel htmlFor="sf-ship-recipient">Recipient</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-recipient" {...registerDestinationField("shipToRecipientName")} />
                  <FieldError errors={[form.formState.errors.shipToRecipientName]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToCompanyName}>
                <FieldLabel htmlFor="sf-ship-company">Company</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-company" {...registerDestinationField("shipToCompanyName")} />
                  <FieldError errors={[form.formState.errors.shipToCompanyName]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToPhoneNumber}>
                <FieldLabel htmlFor="sf-ship-phone">Phone</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-phone" {...registerDestinationField("shipToPhoneNumber")} />
                  <FieldError errors={[form.formState.errors.shipToPhoneNumber]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToEmail}>
                <FieldLabel htmlFor="sf-ship-email">Email</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-email" type="email" {...registerDestinationField("shipToEmail")} />
                  <FieldError errors={[form.formState.errors.shipToEmail]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToAddressLine1} className="md:col-span-2">
                <FieldLabel htmlFor="sf-ship-address1">Address line 1</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-address1" {...registerDestinationField("shipToAddressLine1")} />
                  <FieldError errors={[form.formState.errors.shipToAddressLine1]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToAddressLine2} className="md:col-span-2">
                <FieldLabel htmlFor="sf-ship-address2">Address line 2</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-address2" {...registerDestinationField("shipToAddressLine2")} />
                  <FieldError errors={[form.formState.errors.shipToAddressLine2]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToCity}>
                <FieldLabel htmlFor="sf-ship-city">City</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-city" {...registerDestinationField("shipToCity")} />
                  <FieldError errors={[form.formState.errors.shipToCity]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToStateProvince}>
                <FieldLabel htmlFor="sf-ship-state">State / Province</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-state" {...registerDestinationField("shipToStateProvince")} />
                  <FieldError errors={[form.formState.errors.shipToStateProvince]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToPostalCode}>
                <FieldLabel htmlFor="sf-ship-postal">Postal code</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-postal" {...registerDestinationField("shipToPostalCode")} />
                  <FieldError errors={[form.formState.errors.shipToPostalCode]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToCountry}>
                <FieldLabel htmlFor="sf-ship-country">Country</FieldLabel>
                <FieldContent>
                  <Input id="sf-ship-country" {...registerDestinationField("shipToCountry")} />
                  <FieldError errors={[form.formState.errors.shipToCountry]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.shipToNotes} className="md:col-span-2">
                <FieldLabel htmlFor="sf-ship-destination-notes">Destination notes</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="sf-ship-destination-notes"
                    rows={3}
                    {...registerDestinationField("shipToNotes")}
                  />
                  <FieldError errors={[form.formState.errors.shipToNotes]} />
                </FieldContent>
              </Field>
            </div>
          </div>
        ) : null}

        <CustomFieldsRenderer
          ref={customFieldsRef}
          entityType="shipping"
          entityId={editingId}
          disabled={isSubmitting}
          nativeValues={allValues as Record<string, unknown>}
        />
        </FieldGroup>
      </FieldSet>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
