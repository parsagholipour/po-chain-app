"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { z } from "zod";

export function parseUuidParam(value: string | null | undefined): string | null {
  if (!value) return null;
  const r = z.uuid().safeParse(value);
  return r.success ? r.data : null;
}

/** True if string looks like a lowercase UUID (for shipping id lookup). */
export function looksLikeUuid(s: string): boolean {
  return z.uuid().safeParse(s.trim()).success;
}

export function useClearIdSearchParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has("id")) return;
    next.delete("id");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);
}
