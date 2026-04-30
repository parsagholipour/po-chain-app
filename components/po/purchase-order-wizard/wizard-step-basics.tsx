"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storageObjectDisplayName } from "@/lib/storage/display-name";

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
  isImportingLines?: boolean;
  lineImportMessage?: string | null;
  onRetryLineImport?: () => void;
};

export function WizardStepBasics({
  name,
  onNameChange,
  documentKey,
  docFile,
  onDocFileChange,
  isDocUploading = false,
  onRetryDocUpload,
  isImportingLines = false,
  lineImportMessage = null,
  onRetryLineImport,
}: Props) {
  const displayName = documentDisplayName(documentKey, docFile);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="po-name" required>Name</Label>
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
              <DocumentDownloadLink documentKey={documentKey} fileName={displayName} fallback={null} />
            ) : null}
          </div>
        ) : null}
        {isImportingLines ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Reading PDF and importing SKU quantities...
          </p>
        ) : lineImportMessage ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">{lineImportMessage}</p>
            {onRetryLineImport ? (
              <Button type="button" variant="secondary" size="sm" onClick={onRetryLineImport}>
                Retry AI import
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
