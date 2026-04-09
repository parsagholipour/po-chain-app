"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { presignedFileUrl } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

export function documentDisplayName(documentKey: string | null, docFile: File | null): string | null {
  if (docFile?.name) return docFile.name;
  return storageObjectDisplayName(documentKey);
}

type Props = {
  name: string;
  onNameChange: (value: string) => void;
  documentKey: string | null;
  docFile: File | null;
  onDocFileChange: (file: File | null) => void;
  isDocUploading?: boolean;
  onRetryDocUpload?: () => void;
};

export function WizardStepBasics({
  name,
  onNameChange,
  documentKey,
  docFile,
  onDocFileChange,
  isDocUploading = false,
  onRetryDocUpload,
}: Props) {
  const displayName = documentDisplayName(documentKey, docFile);
  const [downloadState, setDownloadState] = useState<{
    documentKey: string;
    href: string | null;
  } | null>(null);
  const downloadHref =
    downloadState?.documentKey === documentKey ? downloadState.href : null;

  useEffect(() => {
    if (!documentKey) return;
    let cancelled = false;
    presignedFileUrl(documentKey)
      .then((u) => {
        if (!cancelled) setDownloadState({ documentKey, href: u });
      })
      .catch(() => {
        if (!cancelled) setDownloadState({ documentKey, href: null });
      });
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="po-name">Name</Label>
        <Input
          id="po-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Spring restock — EU"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="po-doc">Document (optional)</Label>
        <Input
          id="po-doc"
          type="file"
          disabled={isDocUploading}
          onChange={(e) => onDocFileChange(e.target.files?.[0] ?? null)}
        />
        {docFile && !documentKey && isDocUploading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Uploading…
          </p>
        ) : null}
        {docFile && !documentKey && !isDocUploading && onRetryDocUpload ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onRetryDocUpload()}>
            Retry upload
          </Button>
        ) : null}
        {displayName ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">File:</span>
            <span className="font-medium break-all">{displayName}</span>
            {documentKey ? (
              downloadHref ? (
                <a
                  href={downloadHref}
                  download={displayName}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 gap-1.5",
                  )}
                >
                  <Download className="size-3.5" />
                  Download
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Preparing link…</span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
