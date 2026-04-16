"use client";

import { DocumentDownloadLink } from "@/components/ui/document-download-link";

export function PoDocumentLink({ documentKey }: { documentKey: string | null }) {
  return <DocumentDownloadLink documentKey={documentKey} mode="open" />;
}
