"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { uploadFileToStorage } from "@/lib/upload-client";
import { useWizardDocumentUpload } from "@/lib/use-wizard-document-upload";
import type { Product, SaleChannel } from "@/lib/types/api";
import { WizardStepBasics, documentDisplayName } from "@/components/po/purchase-order-wizard/wizard-step-basics";
import {
  WizardStepLines,
  emptyLineDraft,
  filledLines,
  type LineDraft,
} from "@/components/po/purchase-order-wizard/wizard-step-lines";
import { WizardStepReview } from "@/components/po/purchase-order-wizard/wizard-step-review";
import { WizardStepSaleChannels } from "@/components/po/purchase-order-wizard/wizard-step-sale-channels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

const WIZARD_STEPS = ["Basics", "Sale channel", "Lines", "Review"] as const;

export function NewStockOrderWizard() {
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
  const [isFinishing, setIsFinishing] = useState(false);

  const { data: saleChannels = [], isPending: saleChannelsPending } = useQuery({
    queryKey: ["sale-channels"],
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const nonDistributorChannels = saleChannels.filter(
    (sc) => sc.type !== "distributor",
  );

  useEffect(() => {
    if (saleChannelId === "" && nonDistributorChannels.length === 1) {
      setSaleChannelId(nonDistributorChannels[0].id);
    }
  }, [saleChannelId, nonDistributorChannels]);

  const { data: products = [], isPending: productsPending } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await api.get<Product[]>("/api/products");
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (vars: { documentKey: string | null }) => {
      const { data } = await api.post<{ id: string }>("/api/stock-orders", {
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
      toast.success("Stock order created");
      router.push(`/stock-orders/${row.id}`);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  useEffect(() => {
    if (step !== 2) return;
    if (products.length === 0) return;
    setLines((prev) => (prev.length > 0 ? prev : [emptyLineDraft()]));
  }, [step, products.length]);

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
    if (step === 0) return name.trim().length > 0 && !isDocUploading;
    if (step === 1) return saleChannelId.length > 0;
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
        // toasts
      }
    } finally {
      setIsFinishing(false);
    }
  }

  const saleChannelName =
    nonDistributorChannels.find((s) => s.id === saleChannelId)?.name ?? null;

  const stepDescriptions = [
    "Name the stock order and attach an optional document.",
    "Choose the sale channel for this stock order.",
    "Add products and quantities.",
    "Confirm and create the stock order.",
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/stock-orders"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2")}
          >
            <ChevronLeft className="size-4" />
            Back to list
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">New stock order</h1>
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
            />
          ) : null}

          {step === 1 ? (
            <WizardStepSaleChannels
              isPending={saleChannelsPending}
              saleChannels={nonDistributorChannels}
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
              documentName={documentDisplayName(documentKey, docFile)}
              documentKey={documentKey}
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
              <Button type="submit" disabled={isFinishing || !name.trim() || !saleChannelId}>
                {isFinishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create stock order"
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
