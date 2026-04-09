"use client";

import { useEffect, useState } from "react";
import { presignedFileUrl } from "@/lib/upload-client";

export function ShipDocLink({ docKey }: { docKey: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    presignedFileUrl(docKey)
      .then((u) => {
        if (!cancelled) setHref(u);
      })
      .catch(() => {
        if (!cancelled) setHref(null);
      });
    return () => {
      cancelled = true;
    };
  }, [docKey]);

  if (!href) return null;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary text-xs underline">
      Shipping document
    </a>
  );
}
