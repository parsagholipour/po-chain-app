"use client";

import { useRouter } from "nextjs-toploader/app";
import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StoreOption = {
  id: string;
  slug: string;
  name: string;
};

export function StoreSwitcher({
  stores,
  activeStoreId,
  isCollapsed,
}: {
  stores: StoreOption[];
  activeStoreId: string;
  isCollapsed?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  function onValueChange(nextStoreId: string | null) {
    if (!nextStoreId || nextStoreId === activeStoreId) return;

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/stores/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: nextStoreId }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(payload?.error ?? "Could not switch store");
          }

          queryClient.clear();
          router.refresh();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not switch store";
          toast.error(message);
        }
      })();
    });
  }

  return (
    <div className={isCollapsed ? "flex justify-center" : "space-y-2"}>
      {!isCollapsed && (
        <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Store
        </p>
      )}
      <Select value={activeStoreId} onValueChange={onValueChange} disabled={isPending}>
        <SelectTrigger
          className={isCollapsed ? "h-10 w-10 justify-center p-0 bg-sidebar-accent/50 text-sidebar-foreground [&>svg]:hidden" : "w-full bg-sidebar-accent/50 text-sidebar-foreground"}
          aria-busy={isPending}
        >
          {isCollapsed ? (
            <div className="flex items-center justify-center">
              <Building2 className="size-4" />
              <div className="hidden">
                <SelectValue placeholder="Select store" />
              </div>
            </div>
          ) : (
            <SelectValue placeholder="Select store" />
          )}
        </SelectTrigger>
        <SelectContent align="start">
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <span>{store.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
