"use client";

import { useMemo, useState, type ComponentType, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ManufacturingOrderDetail } from "@/lib/types/api";
import { distributorPoStatusLabels } from "@/lib/po/status-labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-provider";
import { FileText, Package2, Plus, X } from "lucide-react";

export type MoLinkableOrder = {
  id: string;
  number: number;
  name: string;
  type: "distributor" | "stock";
};

type Props = {
  mo: ManufacturingOrderDetail;
  linkableOrders: MoLinkableOrder[];
  onAddPurchaseOrder: (purchaseOrderId: string) => void;
  onRemovePurchaseOrder: (purchaseOrderId: string) => void;
  pending?: boolean;
  /** Omit outer card and intro heading — for use inside `CollapsibleSection`. */
  embedded?: boolean;
};

function orderDetailHref(type: "distributor" | "stock", id: string) {
  return type === "stock" ? `/stock-orders/${id}` : `/purchase-orders/${id}`;
}

type MoPurchaseOrderLink = ManufacturingOrderDetail["purchaseOrders"][number];

function MoLinkedOrderRow({
  row,
  pending,
  onRemove,
}: {
  row: MoPurchaseOrderLink;
  pending: boolean;
  onRemove: (purchaseOrderId: string) => void;
}) {
  const confirm = useConfirm();
  const t = row.purchaseOrder.type;
  const prefix = t === "stock" ? "SO" : "PO";
  const Icon: ComponentType<{ className?: string }> = t === "stock" ? Package2 : FileText;
  const statusLabel =
    distributorPoStatusLabels[row.purchaseOrder.status] ?? row.purchaseOrder.status;

  return (
    <li className="flex overflow-hidden rounded-lg border border-border/60 bg-card shadow-xs ring-1 ring-border/40 transition-shadow hover:shadow-sm">
      <Link
        href={orderDetailHref(t, row.purchaseOrder.id)}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-muted-foreground">
            {prefix} #{row.purchaseOrder.number}
          </span>
          <span className="block truncate font-medium leading-snug">{row.purchaseOrder.name}</span>
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {statusLabel}
        </Badge>
      </Link>
      <div className="flex border-l border-border/60">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          className="h-auto min-h-[2.75rem] rounded-none px-3 text-muted-foreground hover:text-destructive"
          aria-label={`Unlink ${prefix} #${row.purchaseOrder.number}`}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: `Unlink ${prefix} #${row.purchaseOrder.number}?`,
                description:
                  "The order is not deleted—only its link to this manufacturing order is removed. You can link it again later.",
                confirmLabel: "Unlink",
                variant: "destructive",
              });
              if (ok) onRemove(row.purchaseOrderId);
            })();
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function AddLinkPanel({
  title,
  description,
  Icon,
  pickerOpen,
  setPickerOpen,
  selectValue,
  setSelectValue,
  selectItems,
  pending,
  onConfirm,
  chooseLabel,
  placeholder,
  emptyMessage,
  toggleAriaLabelOpen,
  toggleAriaLabelClose,
}: {
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  pickerOpen: boolean;
  setPickerOpen: Dispatch<SetStateAction<boolean>>;
  selectValue: string;
  setSelectValue: (v: string) => void;
  selectItems: { value: string; label: string }[];
  pending: boolean;
  onConfirm: (id: string) => void;
  chooseLabel: string;
  placeholder: string;
  emptyMessage: string;
  toggleAriaLabelOpen: string;
  toggleAriaLabelClose: string;
}) {
  const available = selectItems.length;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background shadow-xs">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium leading-snug">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {!pickerOpen ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {available > 0
                ? `${available} unlinked in list — use + to attach one.`
                : "Nothing left to link from the current list."}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 self-center">
          <Button
            type="button"
            variant={pickerOpen ? "secondary" : "outline"}
            size="icon-sm"
            disabled={pending}
            aria-expanded={pickerOpen}
            aria-label={pickerOpen ? toggleAriaLabelClose : toggleAriaLabelOpen}
            onClick={() => {
              setPickerOpen((o) => {
                if (o) setSelectValue("");
                return !o;
              });
            }}
          >
            {pickerOpen ? (
              <X className="size-4" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {pickerOpen ? (
        available > 0 ? (
          <div className="space-y-3 border-t border-border/50 pt-3">
            <span className="block text-xs font-medium text-muted-foreground">{chooseLabel}</span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Select
                  value={selectValue}
                  items={selectItems}
                  disabled={pending}
                  onValueChange={(v) => setSelectValue(v ?? "")}
                >
                  <SelectTrigger className="min-w-0 w-full">
                    <SelectValue placeholder={placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setSelectValue("");
                    setPickerOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !selectValue}
                  onClick={() => {
                    if (!selectValue) return;
                    onConfirm(selectValue);
                    setSelectValue("");
                    setPickerOpen(false);
                  }}
                >
                  Link
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="border-t border-border/50 pt-3 text-xs text-muted-foreground">{emptyMessage}</p>
        )
      ) : null}
    </div>
  );
}

export function MoLinksSection({
  mo,
  linkableOrders,
  onAddPurchaseOrder,
  onRemovePurchaseOrder,
  pending = false,
  embedded = false,
}: Props) {
  const [poToAdd, setPoToAdd] = useState("");
  const [soToAdd, setSoToAdd] = useState("");
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [soPickerOpen, setSoPickerOpen] = useState(false);

  const linkedIds = useMemo(
    () => new Set(mo.purchaseOrders.map((r) => r.purchaseOrderId)),
    [mo.purchaseOrders],
  );

  const linkedByType = useMemo(() => {
    const openLinkedOrders = mo.purchaseOrders.filter((r) => r.purchaseOrder.status === "open");
    const pos = openLinkedOrders.filter((r) => r.purchaseOrder.type === "distributor");
    const sos = openLinkedOrders.filter((r) => r.purchaseOrder.type === "stock");
    return { pos, sos };
  }, [mo.purchaseOrders]);

  const poSelectItems = useMemo(
    () =>
      linkableOrders
        .filter((o) => o.type === "distributor" && !linkedIds.has(o.id))
        .map((o) => ({
          value: o.id,
          label: `PO #${o.number} · ${o.name}`,
        })),
    [linkableOrders, linkedIds],
  );

  const soSelectItems = useMemo(
    () =>
      linkableOrders
        .filter((o) => o.type === "stock" && !linkedIds.has(o.id))
        .map((o) => ({
          value: o.id,
          label: `SO #${o.number} · ${o.name}`,
        })),
    [linkableOrders, linkedIds],
  );

  const poCount = linkedByType.pos.length;
  const soCount = linkedByType.sos.length;
  const totalLinked = poCount + soCount;

  const body = (
    <>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="min-w-0 lg:flex-1">
            <AddLinkPanel
              title="Purchase order"
              description="Distributor purchase orders for this manufacturing run."
              Icon={FileText}
              pickerOpen={poPickerOpen}
              setPickerOpen={setPoPickerOpen}
              selectValue={poToAdd}
              setSelectValue={setPoToAdd}
              selectItems={poSelectItems}
              pending={pending}
              onConfirm={onAddPurchaseOrder}
              chooseLabel="Select PO"
              placeholder="Choose a purchase order…"
              emptyMessage="No POs left to add from this list (already linked or none loaded)."
              toggleAriaLabelOpen="Add purchase order"
              toggleAriaLabelClose="Close add purchase order"
            />
          </div>
          <div className="min-w-0 lg:flex-1">
            <AddLinkPanel
              title="Stock order"
              description="Internal stock orders to pull inventory from."
              Icon={Package2}
              pickerOpen={soPickerOpen}
              setPickerOpen={setSoPickerOpen}
              selectValue={soToAdd}
              setSelectValue={setSoToAdd}
              selectItems={soSelectItems}
              pending={pending}
              onConfirm={onAddPurchaseOrder}
              chooseLabel="Select stock order"
              placeholder="Choose a stock order…"
              emptyMessage="No stock orders left to add from this list (already linked or none loaded)."
              toggleAriaLabelOpen="Add stock order"
              toggleAriaLabelClose="Close add stock order"
            />
          </div>
        </div>

        <Separator className="bg-border/60" />

        <section className="space-y-4" aria-labelledby="mo-linked-orders-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="mo-linked-orders-heading" className="text-sm font-semibold">
              Currently linked
            </h3>
            <p className="text-xs text-muted-foreground">
              {poCount} PO{poCount === 1 ? "" : "s"} · {soCount} stock order{soCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Purchase orders
              </p>
              {poCount === 0 ? (
                <p className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
                  No purchase orders linked yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedByType.pos.map((row) => (
                    <MoLinkedOrderRow
                      key={row.purchaseOrderId}
                      row={row}
                      pending={pending}
                      onRemove={onRemovePurchaseOrder}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stock orders
              </p>
              {soCount === 0 ? (
                <p className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
                  No stock orders linked yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedByType.sos.map((row) => (
                    <MoLinkedOrderRow
                      key={row.purchaseOrderId}
                      row={row}
                      pending={pending}
                      onRemove={onRemovePurchaseOrder}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{body}</div>;
  }

  return (
    <Card className="border-border/80 shadow-sm ring-border/40">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Orders linked to this MO</CardTitle>
          {totalLinked > 0 ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {totalLinked} linked
            </Badge>
          ) : null}
        </div>
        <CardDescription className="text-xs leading-relaxed">
          Connect distributor POs or stock orders so you can allocate their lines to manufacturers.{" "}
          <Link
            href="/purchase-orders-overview"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Browse POs
          </Link>
          {" · "}
          <Link href="/stock-orders" className="font-medium text-primary underline-offset-4 hover:underline">
            Browse stock orders
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">{body}</CardContent>
    </Card>
  );
}
