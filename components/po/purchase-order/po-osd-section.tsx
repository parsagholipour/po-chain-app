"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PoDocumentLink } from "@/components/po/purchase-order/po-document-link";
import type { PoOsd } from "@/lib/types/api";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-provider";

const typeLabels: Record<PoOsd["type"], string> = {
  overage: "Overage",
  shortage: "Shortage",
  damage: "Damage",
};

const resolutionLabels: Record<PoOsd["resolution"], string> = {
  charged: "Charged",
  returned: "Returned",
  sent: "Sent",
};

type Props = {
  osds: PoOsd[];
  onNew: () => void;
  onEdit: (osd: PoOsd) => void;
  onDelete: (osdId: string) => void;
  busy?: boolean;
};

export function PoOsdSection({ osds, onNew, onEdit, onDelete, busy }: Props) {
  const confirm = useConfirm();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-4" aria-labelledby="po-osd-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="po-osd-heading" className="text-lg font-semibold">
          OS&amp;D
        </h2>
        <Button type="button" size="sm" onClick={onNew} disabled={busy}>
          <Plus className="size-4" />
          New OS&amp;D
        </Button>
      </div>

      {osds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-10 text-center text-sm text-muted-foreground">
          No overages, shortages, or damage recorded yet.
        </p>
      ) : (
        <div className="space-y-3">
          {osds.map((osd) => (
            <Card key={osd.id} className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">
                    {typeLabels[osd.type]}
                    <span className="mx-2 text-muted-foreground">·</span>
                    <Badge variant="secondary" className="font-normal">
                      {resolutionLabels[osd.resolution]}
                    </Badge>
                  </CardTitle>
                  {osd.manufacturingOrder ? (
                    <p className="text-xs text-muted-foreground">
                      MO #{osd.manufacturingOrder.number} — {osd.manufacturingOrder.name}
                      {osd.manufacturer ? (
                        <>
                          {" "}
                          · {osd.manufacturer.name}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <DropdownMenu
                  open={menuOpenId === osd.id}
                  onOpenChange={(o) => setMenuOpenId(o ? osd.id : null)}
                >
                  <DropdownMenuTrigger
                    type="button"
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
                    disabled={busy}
                    aria-label="OS&D actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setMenuOpenId(null);
                        onEdit(osd);
                      }}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        void (async () => {
                          setMenuOpenId(null);
                          const ok = await confirm({
                            title: "Delete this OS&D?",
                            confirmLabel: "Delete",
                            variant: "destructive",
                          });
                          if (ok) onDelete(osd.id);
                        })();
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                  {osd.lines.map((l) => (
                    <li key={l.id}>
                      <span className="font-medium text-foreground">
                        {l.purchaseOrderLine.product.name}
                      </span>{" "}
                      × {l.quantity}
                    </li>
                  ))}
                </ul>
                {osd.notes ? (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Notes: </span>
                    {osd.notes}
                  </p>
                ) : null}
                {osd.documentKey ? (
                  <div>
                    <span className="text-muted-foreground">Document: </span>
                    <PoDocumentLink documentKey={osd.documentKey} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
