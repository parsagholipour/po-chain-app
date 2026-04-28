"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { uploadFileToStorage } from "@/lib/upload-client";
import { useWizardDocumentUpload } from "@/lib/use-wizard-document-upload";
import type { Product, PurchaseOrderPdfLineImportResponse, SaleChannel } from "@/lib/types/api";
import {
  WizardStepBasics,
  documentDisplayName,
} from "@/components/po/purchase-order-wizard/wizard-step-basics";
import {
  WizardStepLines,
  emptyLineDraft,
  filledLines,
  lineDraftProductAssetIssues,
  type LineDraft,
} from "@/components/po/purchase-order-wizard/wizard-step-lines";
import { WizardStepReview } from "@/components/po/purchase-order-wizard/wizard-step-review";
import { WizardStepSaleChannels } from "@/components/po/purchase-order-wizard/wizard-step-sale-channels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isPdfDocument } from "@/components/ui/document-pdf-preview";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

function lineCountLabel(count: number) {
  return `${count} ${count === 1 ? "line" : "lines"}`;
}

function skuCountLabel(count: number) {
  return `${count} ${count === 1 ? "SKU" : "SKUs"}`;
}

export function NewPurchaseOrderWizard() {
  const qc = useQueryClient();
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
  const [saleChannelId, setSaleChannelId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [isImportingPdfLines, setIsImportingPdfLines] = useState(false);
  const [pdfLineImportMessage, setPdfLineImportMessage] = useState<string | null>(null);
  const [pdfLineImportRetryCount, setPdfLineImportRetryCount] = useState(0);
  const attemptedPdfImportKeyRef = useRef<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const { data: saleChannels = [], isPending: saleChannelsPending } = useQuery({
    queryKey: ["sale-channels"],
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const distributorChannels = saleChannels.filter(
    (sc) => sc.type === "distributor",
  );

  useEffect(() => {
    if (saleChannelId === "" && distributorChannels.length === 1) {
      setSaleChannelId(distributorChannels[0].id);
    }
  }, [saleChannelId, distributorChannels]);

  const { data: products = [], isPending: productsPending } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await api.get<Product[]>("/api/products");
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (vars: { documentKey: string | null }) => {
      const { data } = await api.post<{ id: string }>("/api/purchase-orders", {
        name: name.trim(),
        documentKey: vars.documentKey,
        saleChannelId,
        lines: filledLines(lines).map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
      });
      return data;
    },
    onSuccess: (row) => {
      void invalidateNavCounts(qc);
      toast.success("Purchase order created");
      router.push(`/purchase-orders/${row.id}`);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  useEffect(() => {
    if (step !== 2) return;
    if (products.length === 0) return;
    setLines((prev) => (prev.length > 0 ? prev : [emptyLineDraft()]));
  }, [step, products.length]);

  useEffect(() => {
    if (!documentKey || isDocUploading) {
      if (!documentKey) {
        attemptedPdfImportKeyRef.current = null;
        setPdfLineImportMessage(null);
      }
      setIsImportingPdfLines(false);
      return;
    }

    const documentNameForImport = documentDisplayName(documentKey, docFile);
    if (
      !isPdfDocument({
        documentKey,
        file: docFile,
        fileName: documentNameForImport,
      })
    ) {
      setPdfLineImportMessage(null);
      setIsImportingPdfLines(false);
      return;
    }

    if (attemptedPdfImportKeyRef.current === documentKey) return;
    attemptedPdfImportKeyRef.current = documentKey;

    let cancelled = false;
    setIsImportingPdfLines(true);
    setPdfLineImportMessage(null);

    api
      .post<PurchaseOrderPdfLineImportResponse>(
        "/api/purchase-orders/import-lines-from-pdf",
        { documentKey },
      )
      .then(({ data }) => {
        if (cancelled) return;

        if (data.lines.length === 0) {
          const message =
            data.unmatched.length > 0
              ? `AI found ${skuCountLabel(data.unmatched.length)}, but none matched products in this store.`
              : "AI did not find any matching products in this PDF.";
          setPdfLineImportMessage(message);
          toast.warning(message);
          return;
        }

        setLines([
          ...data.lines.map((line) => ({
            productId: line.productId,
            manufacturerId: "",
            quantity: line.quantity,
          })),
          emptyLineDraft(),
        ]);

        const message =
          data.unmatched.length > 0
            ? `Imported ${lineCountLabel(data.lines.length)} from PDF. ${skuCountLabel(data.unmatched.length)} did not match products.`
            : `Imported ${lineCountLabel(data.lines.length)} from PDF.`;
        setPdfLineImportMessage(message);
        toast.success(message);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = `AI import failed: ${apiErrorMessage(e)}`;
        setPdfLineImportMessage(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setIsImportingPdfLines(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentKey, docFile, isDocUploading, pdfLineImportRetryCount]);

  function retryPdfLineImport() {
    attemptedPdfImportKeyRef.current = null;
    setPdfLineImportRetryCount((count) => count + 1);
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => {
      const next = [...prev];
      const prevRow = next[i];
      next[i] = { ...prevRow, ...patch };
      if (patch.productId && !prevRow.productId) {
        const p = products.find((x) => x.id === patch.productId);
        if (p) {
          next[i] = { ...next[i], manufacturerId: p.defaultManufacturerId };
        }
      }
      const isLast = i === next.length - 1;
      const wasEmpty = !prevRow.productId;
      const nowFilled = next[i].productId.length > 0;
      if (isLast && wasEmpty && nowFilled) {
        next.push(emptyLineDraft());
      }
      return next;
    });
  }

  function removeLine(i: number) {
    setLines((prev) => {
      let next = prev.filter((_, j) => j !== i);
      const last = next[next.length - 1];
      if (!last || last.productId.length > 0) {
        next = [...next, emptyLineDraft()];
      }
      return next;
    });
  }

  function canNext(): boolean {
    if (step === 0) return name.trim().length > 0 && !isDocUploading && !isImportingPdfLines;
    if (step === 1) return saleChannelId.length > 0;
    if (step === 2) return productAssetIssues.length === 0;
    return true;
  }

  function onWizardSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < WIZARD_STEPS.length - 1) {
      if (canNext()) setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1));
    } else {
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    setIsFinishing(true);
    try {
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
        // createMut onError already toasts
      }
    } finally {
      setIsFinishing(false);
    }
  }

  const saleChannelName =
    saleChannels.find((s) => s.id === saleChannelId)?.name ?? null;
  const productAssetIssues = lineDraftProductAssetIssues(lines, products);
  const documentName = documentDisplayName(documentKey, docFile);
  const hasPdfPreview =
    step === 3 &&
    Boolean(documentKey) &&
    isPdfDocument({ documentKey, file: docFile, fileName: documentName });

  const stepDescriptions = [
    "Name the PO and attach an optional document.",
    "Choose the distributor sale channel for this order.",
    "Add products and quantities from the distributor.",
    "Confirm and create the purchase order.",
  ] as const;

  const WIZARD_STEPS = ["Basics", "Sale channel", "Lines", "Review"] as const;

  return (
    <div className={cn("mx-auto space-y-8", hasPdfPreview ? "max-w-6xl" : "max-w-3xl")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/purchase-orders-overview"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2")}
          >
            <ChevronLeft className="size-4" />
            Back to list
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step]}
          </p>
        </div>
        <div className="flex gap-1">
          {WIZARD_STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={cn(
                "h-2 w-8 rounded-full transition-colors",
                i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted",
              )}
              onClick={() => {
                if (step === 0 && (isDocUploading || isImportingPdfLines) && i > 0) return;
                setStep(i);
              }}
              aria-label={label}
            />
          ))}
        </div>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{WIZARD_STEPS[step]}</CardTitle>
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
              isImportingLines={isImportingPdfLines}
              lineImportMessage={pdfLineImportMessage}
              onRetryLineImport={
                documentKey && pdfLineImportMessage && !isImportingPdfLines
                  ? retryPdfLineImport
                  : undefined
              }
            />
          ) : null}

          {step === 1 ? (
            <WizardStepSaleChannels
              isPending={saleChannelsPending}
              saleChannels={distributorChannels}
              value={saleChannelId}
              onChange={setSaleChannelId}
            />
          ) : null}

          {step === 2 ? (
            <WizardStepLines
              isPending={productsPending}
              products={products}
              manufacturers={[]}
              manufacturerIdList={[]}
              lines={lines}
              onUpdateLine={updateLine}
              onRemoveLine={removeLine}
              hideManufacturer
            />
          ) : null}

          {step === 3 ? (
            <WizardStepReview
              name={name}
              hasDocument={!!(documentKey || docFile)}
              documentName={documentName}
              documentKey={documentKey}
              documentFile={docFile}
              saleChannelName={saleChannelName}
              manufacturerNames={[]}
              lines={filledLines(lines)}
              products={products}
              manufacturers={[]}
              hideManufacturers
            />
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
            {step < WIZARD_STEPS.length - 1 ? (
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
                  !saleChannelId ||
                  productAssetIssues.length > 0
                }
              >
                {isFinishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create purchase order"
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
