"use client";

import Link from "next/link";
import type { ShippingRow } from "@/lib/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { shippingStatusLabels, statusBadgeClassName } from "@/lib/po/status-labels";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import { shippingOrderHref } from "@/lib/shipping";
import { PriceView } from "@/components/ui/price-view";

interface ShippingTableProps {
  shippings: ShippingRow[];
  isPending?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

function shippingDestinationLabel(shipping: ShippingRow) {
  const cityLine = [
    shipping.shipToCity,
    shipping.shipToStateProvince,
    shipping.shipToPostalCode,
    shipping.shipToCountry,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    shipping.shipToRecipientName,
    shipping.shipToCompanyName,
    shipping.shipToAddressLine1,
    cityLine,
  ]
    .filter(Boolean)
    .join(" - ");
}

export function ShippingTable({
  shippings,
  isPending = false,
  onEdit,
  onDelete,
  readOnly = false,
}: ShippingTableProps) {
  const showActions = !readOnly && onEdit != null && onDelete != null;
  const colSpan = showActions ? 10 : 9;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tracking #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-end">Cost</TableHead>
            <TableHead>DDP</TableHead>
            <TableHead>Partner</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Shipped At</TableHead>
            <TableHead>Linked Orders</TableHead>
            <TableHead>Links</TableHead>
            {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-28 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : null}
          {!isPending &&
            shippings.map((shipping) => (
            <TableRow key={shipping.id}>
              <TableCell className="font-medium">{shipping.trackingNumber}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={statusBadgeClassName(shipping.status)}>
                  {shippingStatusLabels[shipping.status] ?? shipping.status}
                </Badge>
              </TableCell>
              <TableCell className="text-end text-muted-foreground">
                <PriceView value={shipping.cost} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {shipping.deliveryDutiesPaid ? "Yes" : "—"}
              </TableCell>
              <TableCell>
                {shipping.logisticsPartner?.name || "-"}
              </TableCell>
              <TableCell
                className="max-w-[240px] truncate text-muted-foreground"
                title={shippingDestinationLabel(shipping) || undefined}
              >
                {shippingDestinationLabel(shipping) || "-"}
              </TableCell>
              <TableCell>
                {shipping.shippedAt
                  ? new Date(shipping.shippedAt).toLocaleDateString()
                  : "-"}
              </TableCell>
              <TableCell>
                {shipping.orders.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {shipping.orders.map((order) => (
                      <Link key={order.id} href={shippingOrderHref(order)}>
                        <Badge variant="outline" className="text-xs hover:bg-muted">
                          #{order.number}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  {shipping.trackingLink ? (
                    <a
                      href={shipping.trackingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Track
                    </a>
                  ) : null}
                  {shipping.invoiceDocumentKey ? (
                    <StorageObjectLink
                      reference={shipping.invoiceDocumentKey}
                      label="Document"
                    />
                  ) : null}
                  {!shipping.trackingLink && !shipping.invoiceDocumentKey ? "-" : null}
                </div>
              </TableCell>
              {showActions ? (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit!(shipping.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => onDelete!(shipping.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!isPending && shippings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                No shipping records found
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
