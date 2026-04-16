"use client";

import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  findLinesMissingProductAssets,
  formatMissingProductAssetsError,
} from "@/lib/mo-product-assets";
import { uploadFileToStorage } from "@/lib/upload-client";
import { useWizardDocumentUpload } from "@/lib/use-wizard-document-upload";
import type { Manufacturer, PurchaseOrderDetail, PurchaseOrderSummary } from "@/lib/types/api";
import { WizardStepBasics, documentDisplayName } from "@/components/po/purchase-order-wizard/wizard-step-basics";
import { Button, buttonVariants } from "@/components/ui/button";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { distributorPoStatusLabels } from "@/lib/po/status-labels";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Basics", "POs & stock orders", "Manufacturers", "Review"] as const;

type WizardOrderRow = {
  id: string;
  number: number;
  name: string;
  status: string;
  createdAt: string;
  saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
  kind: "distributor" | "stock";
};

export function NewManufacturingOrderWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const {
    documentKey,
    setDocumentKey,
    docFile,
    isDocUploading,
    onDocFileChange,
    onRetryDocUpload,
  } = useWizardDocumentUpload("purchase-orders");
  const [purchaseOrderIds, setPurchaseOrderIds] = useState<Set<string>>(new Set());
  /** Manufacturers the user adds beyond those required by linked order lines. */
  const [extraManufacturerIds, setExtraManufacturerIds] = useState<Set<string>>(new Set());
  const [isFinishing, setIsFinishing] = useState(false);

  const purchaseOrderIdList = useMemo(
    () => [...purchaseOrderIds].sort(),
    [purchaseOrderIds],
  );

  const { data: purchaseOrders = [], isPending: purchaseOrdersPending } = useQuery({
    queryKey: ["purchase-orders", "all-for-mo-wizard"],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrderSummary[]>(
        "/api/purchase-orders",
      );
      return data;
    },
  });

  const { data: stockOrders = [], isPending: stockOrdersPending } = useQuery({
    queryKey: ["stock-orders", "all-for-mo-wizard"],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrderSummary[]>(
        "/api/stock-orders",
      );
      return data;
    },
  });

  const ordersCatalogPending = purchaseOrdersPending || stockOrdersPending;

  const mergedOrders = useMemo((): WizardOrderRow[] => {
    const rows: WizardOrderRow[] = [
      ...purchaseOrders.map((o) => ({ ...o, kind: "distributor" as const })),
      ...stockOrders.map((o) => ({ ...o, kind: "stock" as const })),
    ];
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [purchaseOrders, stockOrders]);

  const orderKindById = useMemo(() => {
    const m = new Map<string, "distributor" | "stock">();
    for (const o of mergedOrders) m.set(o.id, o.kind);
    return m;
  }, [mergedOrders]);

  const orderDetailQueries = useQueries({
    queries: purchaseOrderIdList.map((id) => {
      const kind = orderKindById.get(id);
      return {
        queryKey: ["mo-wizard-order", kind ?? "unknown", id] as const,
        queryFn: async () => {
          if (kind === "stock") {
            const { data } = await api.get<Extract<PurchaseOrderDetail, { type: "stock" }>>(
              `/api/stock-orders/${id}`,
            );
            return data;
          }
          const { data } = await api.get<Extract<PurchaseOrderDetail, { type: "distributor" }>>(
            `/api/purchase-orders/${id}`,
          );
          return data;
        },
        enabled: kind === "distributor" || kind === "stock",
      };
    }),
  });

  const requiredManufacturerIds = new Set<string>();
  for (const q of orderDetailQueries) {
    if (!q.data) continue;
    for (const line of q.data.lines) {
      requiredManufacturerIds.add(line.product.defaultManufacturerId);
    }
  }
  const missingProductAssetLines = orderDetailQueries.flatMap((q) => {
    const order = q.data;
    if (!order) return [];
    return findLinesMissingProductAssets(
      order.lines.map((line) => ({
        ...line,
        purchaseOrder: {
          number: order.number,
          name: order.name,
          type: order.type,
        },
      })),
    );
  });

  const orderDefaultsLoading =
    purchaseOrderIdList.length > 0 &&
    orderDetailQueries.some((q) => q.isPending || q.isFetching);

  const allSelectedManufacturerIds = new Set(requiredManufacturerIds);
  for (const id of extraManufacturerIds) allSelectedManufacturerIds.add(id);

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => {
      const { data } = await api.get<Manufacturer[]>("/api/manufacturers");
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (vars: { documentKey: string | null }) => {
      const { data } = await api.post<{ id: string }>("/api/manufacturing-orders", {
        name: name.trim(),
        documentKey: vars.documentKey,
        purchaseOrderIds: [...purchaseOrderIds],
        manufacturers: [...allSelectedManufacturerIds].map((manufacturerId) => ({
          manufacturerId,
        })),
      });
      return data;
    },
    onSuccess: (row) => {
      toast.success("Manufacturing order created");
      router.push(`/manufacturing-orders/${row.id}`);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  function toggleSet(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canNext(): boolean {
    if (step === 0) return name.trim().length > 0 && !isDocUploading;
    return true;
  }

  function onWizardSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      if (canNext()) setStep((s) => Math.min(STEPS.length - 1, s + 1));
    } else {
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    setIsFinishing(true);
    try {
      if (orderDefaultsLoading) {
        toast.error("Wait for selected order lines to finish loading");
        return;
      }
      if (missingProductAssetLines.length > 0) {
        toast.error(
          formatMissingProductAssetsError(
            missingProductAssetLines,
            "Cannot create this manufacturing order",
          ),
        );
        return;
      }

      let key = documentKey;
      if (docFile && !key) {
        try {
          key = await uploadFileToStorage(docFile, "purchase-orders");
          setDocumentKey(key);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Upload failed");
          return;
        }
      }
      try {
        await createMut.mutateAsync({ documentKey: key });
      } catch {
        // toasts
      }
    } finally {
      setIsFinishing(false);
    }
  }

  const stepDescriptions = [
    "Name the manufacturing order and attach an optional document.",
    "Link distributor POs and/or stock orders. Lines are allocated on create to each product’s default manufacturer.",
    "Manufacturers implied by linked lines are selected automatically and cannot be cleared. Add more manufacturers when several factories are involved.",
    "Confirm and create.",
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/manufacturing-orders"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2")}
          >
            <ChevronLeft className="size-4" />
            Back to list
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">New manufacturing order</h1>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>
        <div className="flex gap-1">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={cn(
                "h-2 w-8 rounded-full transition-colors",
                i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted",
              )}
              onClick={() => {
                if (step === 0 && isDocUploading && i > 0) return;
                setStep(i);
              }}
              aria-label={label}
            />
          ))}
        </div>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>{stepDescriptions[step]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-6" onSubmit={onWizardSubmit}>
          {step === 0 ? (
            <WizardStepBasics
              name={name}
              onNameChange={setName}
              documentKey={documentKey}
              docFile={docFile}
              onDocFileChange={onDocFileChange}
              isDocUploading={isDocUploading}
              onRetryDocUpload={onRetryDocUpload}
            />
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Orders</p>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-3">
                {ordersCatalogPending && mergedOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : mergedOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No purchase or stock orders yet. Create them from their respective lists.
                  </p>
                ) : (
                  mergedOrders.map((o) => (
                    <label
                      key={o.id}
                      htmlFor={`order-${o.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`order-${o.id}`}
                        checked={purchaseOrderIds.has(o.id)}
                        onCheckedChange={() => toggleSet(setPurchaseOrderIds, o.id)}
                      />
                      <div className="flex flex-1 items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-[10px] font-medium shrink-0">
                          {o.kind === "stock" ? "Stock" : "PO"}
                        </Badge>
                        <span className="font-medium truncate">{o.name}</span>
                        {o.saleChannel ? (
                          <span className="text-xs text-muted-foreground truncate">{o.saleChannel.name}</span>
                        ) : null}
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {distributorPoStatusLabels[o.status] ?? o.status}
                        </Badge>
                        <a
                          href={o.kind === "stock" ? `/stock-orders/${o.id}` : `/purchase-orders/${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {purchaseOrderIdList.length > 0 && orderDefaultsLoading ? (
                <p className="text-xs text-muted-foreground">
                  Loading default manufacturers from selected order lines…
                </p>
              ) : null}
              {missingProductAssetLines.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive">
                    Selected order line products need barcode, packaging, and verified status before creating an MO:
                  </p>
                  <ul className="text-xs text-destructive/80 list-disc list-inside">
                    {missingProductAssetLines.slice(0, 5).map((line, i) => (
                      <li key={`${line.product.sku}-${i}`}>
                        {line.product.sku} - {line.product.name} ({line.missingFields.join(" and ")})
                      </li>
                    ))}
                    {missingProductAssetLines.length > 5 && (
                      <li>+{missingProductAssetLines.length - 5} more</li>
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Manufacturers required by your linked lines (via each product’s default manufacturer)
                stay selected. Choose any additional factories below.
              </p>
              {purchaseOrderIdList.length > 0 && orderDefaultsLoading ? (
                <p className="text-xs text-muted-foreground">
                  Resolving required manufacturers from order lines…
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {manufacturersPending && manufacturers.length === 0 ? (
                  <p className="col-span-full text-sm text-muted-foreground">Loading…</p>
                ) : !manufacturersPending && manufacturers.length === 0 ? (
                  <p className="col-span-full text-sm text-muted-foreground">
                    No manufacturers yet. Add one under Manufacturers.
                  </p>
                ) : (
                  manufacturers.map((m) => {
                    const required = requiredManufacturerIds.has(m.id);
                    const checked = required || extraManufacturerIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border border-border/60 p-3 text-sm",
                          required ? "cursor-default bg-muted/40" : "cursor-pointer",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={required}
                          onCheckedChange={() => {
                            if (required) return;
                            toggleSet(setExtraManufacturerIds, m.id);
                          }}
                        />
                        <span>
                          <span className="font-medium">{m.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {required ? "Required from linked line(s)" : m.region}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name: </span>
                <span className="font-medium">{name.trim()}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Document:</span>
                {documentKey || docFile ? (
                  documentDisplayName(documentKey, docFile) ? (
                    <>
                      <span className="font-medium break-all">{documentDisplayName(documentKey, docFile)}</span>
                      {documentKey ? (
                        <DocumentDownloadLink documentKey={documentKey} fileName={documentDisplayName(documentKey, docFile)} fallback={null} />
                      ) : null}
                    </>
                  ) : "Yes"
                ) : "No"}
              </div>
              <div>
                <span className="text-muted-foreground">Linked orders: </span>
                {purchaseOrderIds.size === 0 ? (
                  "None"
                ) : (
                  <ul className="mt-2 space-y-2">
                    {purchaseOrderIdList.map((id) => {
                      const o = mergedOrders.find((m) => m.id === id);
                      if (!o) return null;
                      return (
                        <li key={id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                          <Badge variant="outline" className="text-[10px] font-medium shrink-0">
                            {o.kind === "stock" ? "Stock" : "PO"}
                          </Badge>
                          <span className="font-medium">{o.name}</span>
                          {o.saleChannel ? (
                            <span className="text-xs text-muted-foreground truncate">
                              {o.saleChannel.name}
                            </span>
                          ) : null}
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">
                            {new Date(o.createdAt).toLocaleDateString()}
                          </span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {distributorPoStatusLabels[o.status] ?? o.status}
                          </Badge>
                          <a
                            href={o.kind === "stock" ? `/stock-orders/${o.id}` : `/purchase-orders/${o.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Manufacturers: </span>
                {allSelectedManufacturerIds.size === 0 ? (
                  "None"
                ) : (
                  <ul className="mt-2 space-y-2">
                    {[...allSelectedManufacturerIds].map((id) => {
                      const m = manufacturers.find((m) => m.id === id);
                      if (!m) return null;
                      return (
                        <li key={id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                          <span className="font-medium">{m.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{m.region}</span>
                          <a
                            href={`/manufacturers/${m.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {requiredManufacturerIds.size > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Required from linked lines:{" "}
                  {[...requiredManufacturerIds]
                    .map((id) => manufacturers.find((m) => m.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                  . Line allocations to those manufacturers are created when you submit.
                </p>
              ) : null}
              {missingProductAssetLines.length > 0 ? (
                <p className="text-xs font-medium text-destructive">
                  Selected order line products need barcode and packaging before creating an MO.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit" disabled={!canNext()}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  isFinishing ||
                  !name.trim() ||
                  orderDefaultsLoading ||
                  missingProductAssetLines.length > 0
                }
              >
                {isFinishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create manufacturing order"
                )}
              </Button>
            )}
          </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
