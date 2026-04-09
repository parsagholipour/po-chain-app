"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { presignedFileUrl } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

type Props = {
  reference: string | null;
  label?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  className?: string;
};

export function StorageObjectLink({
  reference,
  label,
  emptyLabel = "None",
  loadingLabel = "Preparing link...",
  className,
}: Props) {
  const [linkState, setLinkState] = useState<{
    reference: string;
    href: string | null;
  } | null>(null);
  const href = linkState && linkState.reference === reference ? linkState.href : null;

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    presignedFileUrl(reference)
      .then((u) => {
        if (!cancelled) setLinkState({ reference, href: u });
      })
      .catch(() => {
        if (!cancelled) setLinkState({ reference, href: null });
      });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (!reference) return <span className="text-muted-foreground">{emptyLabel}</span>;
  if (!href) return <span className="text-muted-foreground">{loadingLabel}</span>;

  const displayLabel = label ?? storageObjectDisplayName(reference) ?? "Open file";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0", className)}
    >
      {displayLabel}
      <ExternalLink className="size-3" />
    </a>
  );
}
