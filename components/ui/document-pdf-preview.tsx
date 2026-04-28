"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { cn } from "@/lib/utils";
import { presignedFileUrl } from "@/lib/upload-client";

type PdfDetectionInput = {
  documentKey?: string | null;
  file?: File | null;
  fileName?: string | null;
};

function hasPdfExtension(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.pdf(?:$|[?#])/i.test(value.trim());
}

export function isPdfDocument({ documentKey = null, file = null, fileName = null }: PdfDetectionInput) {
  const fileType = file?.type.toLowerCase();
  if (fileType === "application/pdf") return true;
  return (
    hasPdfExtension(file?.name) ||
    hasPdfExtension(fileName) ||
    hasPdfExtension(storageObjectDisplayName(documentKey))
  );
}

function pdfEmbedUrl(url: string): string {
  const baseUrl = url.split("#", 1)[0];
  return `${baseUrl}#toolbar=1&navpanes=0&view=FitH`;
}

type DocumentPdfPreviewProps = {
  documentKey?: string | null;
  file?: File | null;
  fileName?: string | null;
  className?: string;
};

export function DocumentPdfPreview({
  documentKey = null,
  file = null,
  fileName = null,
  className,
}: DocumentPdfPreviewProps) {
  const shouldPreview = Boolean(documentKey) && isPdfDocument({ documentKey, file, fileName });
  const [remoteResult, setRemoteResult] = useState<{
    documentKey: string;
    url: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!shouldPreview || !documentKey) return;

    let cancelled = false;
    presignedFileUrl(documentKey)
      .then((url) => {
        if (!cancelled) setRemoteResult({ documentKey, url, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRemoteResult({
            documentKey,
            url: null,
            error: e instanceof Error ? e.message : "Could not load document",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentKey, shouldPreview]);

  if (!shouldPreview) return null;

  const activeRemoteResult = remoteResult?.documentKey === documentKey ? remoteResult : null;
  const previewUrl = activeRemoteResult?.url ?? null;
  const error = activeRemoteResult?.error ?? null;
  const displayName = fileName ?? file?.name ?? storageObjectDisplayName(documentKey) ?? "Document.pdf";

  return (
    <aside className={cn("min-w-0 space-y-3", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            Document
          </p>
          <p className="truncate text-xs text-muted-foreground">{displayName}</p>
        </div>
        {previewUrl ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5")}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Open
          </a>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
        {previewUrl ? (
          <iframe
            src={pdfEmbedUrl(previewUrl)}
            title={`PDF document: ${displayName}`}
            className="h-[min(72vh,760px)] min-h-[520px] w-full bg-background"
          />
        ) : (
          <div className="flex min-h-[520px] items-center justify-center bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {error ? (
              <span>{error}</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Preparing document
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
