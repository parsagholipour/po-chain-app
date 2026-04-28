"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { DocumentPdfPreview, isPdfDocument } from "@/components/ui/document-pdf-preview";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import type { Manufacturer, Product } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import type { LineDraft } from "./wizard-step-lines";

export type WizardLinePreviewItem = {
  key: string;
  productId: string;
  productName: string;
  sku: string | null;
  imageKey: string | null;
  quantity: number;
  manufacturerName?: string | null;
  source?: ReactNode;
};

function productHref(productId: string): string {
  return `/products?id=${productId}`;
}

const productImageFallback = (
  <div
    className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
    aria-hidden
  >
    <ImageOff className="size-5 opacity-45" strokeWidth={1.5} />
  </div>
);

export function WizardLinesPreview({
  lines,
  emptyMessage = "None",
}: {
  lines: WizardLinePreviewItem[];
  emptyMessage?: string;
}) {
  if (lines.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border/60">
      <ul className="divide-y divide-border/60">
        {lines.map((line) => (
          <li
            key={line.key}
            className="flex flex-col gap-3 bg-background p-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <StorageObjectImage
                reference={line.imageKey}
                alt={line.productName}
                className="size-14 shrink-0 rounded-md bg-muted/30"
                imgClassName="rounded-md"
                objectFit="contain"
                fallback={productImageFallback}
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{line.productName}</p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {line.sku ? <span className="font-mono">{line.sku}</span> : null}
                  {line.manufacturerName ? <span>{line.manufacturerName}</span> : null}
                </div>
                {line.source ? (
                  <div className="mt-1 min-w-0 text-xs text-muted-foreground">{line.source}</div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-[4.25rem] sm:pl-0">
              <Badge variant="secondary" className="font-medium">
                Qty {line.quantity}
              </Badge>
              <Link
                href={productHref(line.productId)}
                className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                aria-label={`Open product ${line.productName}`}
                title="Open product"
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  name: string;
  hasDocument: boolean;
  /** When set, shown instead of a bare "Yes" for the document row. */
  documentName?: string | null;
  /** Storage key for the uploaded document — enables a download link. */
  documentKey?: string | null;
  /** Selected file, when the wizard still has the browser File available. */
  documentFile?: File | null;
  saleChannelName: string | null;
  manufacturerNames: string[];
  lines: LineDraft[];
  products: Product[];
  manufacturers: Manufacturer[];
  hideManufacturers?: boolean;
  /** When true, omit the sale channel row (e.g. stock orders). */
  hideSaleChannel?: boolean;
};

export function WizardStepReview({
  name,
  hasDocument,
  documentName = null,
  documentKey = null,
  documentFile = null,
  saleChannelName,
  manufacturerNames,
  lines,
  products,
  manufacturers,
  hideManufacturers = false,
  hideSaleChannel = false,
}: Props) {
  const linePreviewItems: WizardLinePreviewItem[] = lines.map((line, i) => {
    const p = products.find((x) => x.id === line.productId);
    const m = manufacturers.find((x) => x.id === line.manufacturerId);
    return {
      key: `${line.productId}-${i}`,
      productId: line.productId,
      productName: p?.name ?? line.productId,
      sku: p?.sku ?? null,
      imageKey: p?.imageKey ?? null,
      quantity: line.quantity,
      manufacturerName: hideManufacturers
        ? p?.defaultManufacturer.name ?? null
        : m?.name ?? null,
    };
  });
  const showPdfPreview =
    Boolean(documentKey) &&
    isPdfDocument({
      documentKey,
      file: documentFile,
      fileName: documentName,
    });

  return (
    <div
      className={cn(
        "text-sm",
        showPdfPreview
          ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start"
          : "space-y-4",
      )}
    >
      <div className="space-y-4">
      <div>
        <span className="text-muted-foreground">Name: </span>
        <span className="font-medium">{name.trim() || "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Document:</span>
        {hasDocument ? (
          documentName ? (
            <>
              <span className="font-medium break-all">{documentName}</span>
              {documentKey ? (
                <DocumentDownloadLink documentKey={documentKey} fileName={documentName} fallback={null} />
              ) : null}
            </>
          ) : (
            "Yes"
          )
        ) : (
          "No"
        )}
      </div>
      {hideSaleChannel ? null : (
        <div>
          <span className="text-muted-foreground">Sale channel: </span>
          {saleChannelName ?? "None"}
        </div>
      )}
      {hideManufacturers ? null : (
        <div>
          <span className="text-muted-foreground">Manufacturers: </span>
          {manufacturerNames.length > 0 ? manufacturerNames.join(", ") : "—"}
        </div>
      )}
      <div>
        <span className="text-muted-foreground">Lines: </span>
        <WizardLinesPreview lines={linePreviewItems} />
      </div>
      </div>

      {showPdfPreview ? (
        <DocumentPdfPreview
          documentKey={documentKey}
          file={documentFile}
          fileName={documentName}
          className="lg:sticky lg:top-4"
        />
      ) : null}
    </div>
  );
}
