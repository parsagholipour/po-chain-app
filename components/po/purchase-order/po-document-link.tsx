"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { presignedFileUrl } from "@/lib/upload-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PoDocumentLink({ documentKey }: { documentKey: string | null }) {
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

  if (!documentKey) return <span className="text-muted-foreground">None</span>;
  if (!href) return <span className="text-muted-foreground">Loading…</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
    >
      Open document
      <ExternalLink className="size-3" />
    </a>
  );
}
