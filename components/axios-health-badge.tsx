"use client";

import { api } from "@/lib/axios";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

export function AxiosHealthBadge() {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    api
      .get<{ ok: boolean }>("/api/health")
      .then((res) => {
        setState(res.data?.ok ? "ok" : "error");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "idle") {
    return <Badge variant="secondary">Axios: checking…</Badge>;
  }
  if (state === "ok") {
    return <Badge>Axios: API OK</Badge>;
  }
  return <Badge variant="destructive">Axios: failed</Badge>;
}
