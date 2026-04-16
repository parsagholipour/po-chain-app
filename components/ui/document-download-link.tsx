"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presignedFileUrl } from "@/lib/upload-client";

type Mode = "download" | "open";

type Props = {
  /** Storage key for the document. When null, renders the `fallback` instead. */
  documentKey: string | null;
  /** File name used for the browser `download` attribute (download mode only). */
  fileName?: string | null;
  /** Content shown when `documentKey` is null. Defaults to "None". */
  fallback?: React.ReactNode;
  /**
   * - "download" — outline button with Download icon, triggers browser download.
   * - "open" — inline link with ExternalLink icon, opens in new tab.
   * @default "download"
   */
  mode?: Mode;
};

const modeConfig: Record<Mode, { label: string; icon: typeof Download; className: string }> = {
  download: {
    label: "Download",
    icon: Download,
    className: cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5"),
  },
  open: {
    label: "Open document",
    icon: ExternalLink,
    className: cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0"),
  },
};

export function DocumentDownloadLink({
  documentKey,
  fileName = null,
  fallback = <span className="text-muted-foreground">None</span>,
  mode = "download",
}: Props) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!documentKey) {
      setHref(null);
      return;
    }
    let cancelled = false;
    presignedFileUrl(documentKey)
      .then((u) => {
        if (!cancelled) setHref(u);
      })
      .catch(() => {
        if (!cancelled) setHref(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  if (!documentKey) return <>{fallback}</>;
  if (!href) return <span className="text-xs text-muted-foreground">Preparing link…</span>;

  const { label, icon: Icon, className } = modeConfig[mode];

  return (
    <a
      href={href}
      download={mode === "download" ? (fileName ?? undefined) : undefined}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      <Icon className="size-3.5" />
      {label}
    </a>
  );
}
