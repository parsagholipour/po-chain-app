"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { LinkedWarehouseOrderRef } from "@/lib/types/api";
import {
  statusBadgeClassName,
  warehouseOrderStatusLabels,
} from "@/lib/po/status-labels";
import { cn } from "@/lib/utils";

type Props = {
  warehouseOrders: LinkedWarehouseOrderRef[];
};

export function PoLinkedWarehouseOrdersSection({ warehouseOrders }: Props) {
  return (
    <section className="space-y-4" aria-labelledby="po-linked-wo-heading">
      <h2 id="po-linked-wo-heading" className="text-lg font-semibold">
        Warehouse orders
      </h2>
      {warehouseOrders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-10 text-center text-sm text-muted-foreground">
          No warehouse orders linked yet. Create one under{" "}
          <Link
            href="/warehouse-orders/new"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Warehouse orders
          </Link>{" "}
          to fulfill this PO from inventory.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {warehouseOrders.map((wo) => (
            <li key={wo.id}>
              <Link
                href={`/warehouse-orders/${wo.id}`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-auto w-full justify-start gap-3 px-4 py-3 text-start",
                )}
              >
                <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs text-muted-foreground">
                    WO #{wo.number} - {wo.warehouse.name}
                  </span>
                  <span className="block truncate font-medium">{wo.name}</span>
                </span>
                <Badge
                  variant="secondary"
                  className={`${statusBadgeClassName(wo.status)} shrink-0 text-[10px]`}
                >
                  {warehouseOrderStatusLabels[wo.status] ?? wo.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
