"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { LinkedManufacturingOrderRef } from "@/lib/types/api";
import { moStatusLabels } from "@/lib/po/status-labels";
import { Badge } from "@/components/ui/badge";
import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  manufacturingOrders: LinkedManufacturingOrderRef[];
};

export function PoLinkedMosSection({ manufacturingOrders }: Props) {
  return (
    <section className="space-y-4" aria-labelledby="po-linked-mo-heading">
      <h2 id="po-linked-mo-heading" className="text-lg font-semibold">
        Manufacturing orders
      </h2>
      {manufacturingOrders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-10 text-center text-sm text-muted-foreground">
          No manufacturing orders linked yet. Create one under{" "}
          <Link href="/manufacturing-orders/new" className="font-medium text-primary underline-offset-4 hover:underline">
            Manufacturing orders
          </Link>{" "}
          and link this purchase order.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {manufacturingOrders.map((mo) => (
            <li key={mo.id}>
              <Link
                href={`/manufacturing-orders/${mo.id}`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-auto w-full justify-start gap-3 px-4 py-3 text-start",
                )}
              >
                <Factory className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs text-muted-foreground">
                    MO #{mo.number}
                  </span>
                  <span className="block truncate font-medium">{mo.name}</span>
                </span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {moStatusLabels[mo.status] ?? mo.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
