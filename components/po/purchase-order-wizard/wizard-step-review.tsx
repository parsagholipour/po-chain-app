"use client";

import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import type { Manufacturer, Product } from "@/lib/types/api";
import type { LineDraft } from "./wizard-step-lines";

type Props = {
  name: string;
  hasDocument: boolean;
  /** When set, shown instead of a bare "Yes" for the document row. */
  documentName?: string | null;
  /** Storage key for the uploaded document — enables a download link. */
  documentKey?: string | null;
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
  saleChannelName,
  manufacturerNames,
  lines,
  products,
  manufacturers,
  hideManufacturers = false,
  hideSaleChannel = false,
}: Props) {
  return (
    <div className="space-y-4 text-sm">
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
        {lines.length === 0 ? (
          "None"
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1">
            {lines.map((line, i) => {
              const p = products.find((x) => x.id === line.productId);
              const m = manufacturers.find((x) => x.id === line.manufacturerId);
              const mLabel = hideManufacturers
                ? p?.defaultManufacturer.name ?? "—"
                : (m?.name ?? "?");
              return (
                <li key={i}>
                  {p?.name ?? line.productId} × {line.quantity} — {mLabel}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
