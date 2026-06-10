"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/confirm-provider";
import type { SaleChannelLocation } from "@/lib/types/api";
import { Pencil, Trash2 } from "lucide-react";

type Props = {
  rows: SaleChannelLocation[];
  isPending: boolean;
  emptyMessage?: string;
  onEdit: (row: SaleChannelLocation) => void;
  onDelete: (row: SaleChannelLocation) => void;
};

export function compactSaleChannelLocationAddress(location: SaleChannelLocation) {
  return [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.stateProvince,
    location.postalCode,
    location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SaleChannelLocationsTable({
  rows,
  isPending,
  emptyMessage = "No locations yet.",
  onEdit,
  onDelete,
}: Props) {
  const confirm = useConfirm();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Identifier</TableHead>
          <TableHead>Location Name</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Address</TableHead>
          <TableHead className="max-w-[140px]">Phone</TableHead>
          <TableHead className="max-w-[160px]">Email</TableHead>
          <TableHead className="w-[120px] text-end">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              Loading...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const address = compactSaleChannelLocationAddress(row);

            return (
              <TableRow key={row.id}>
                <TableCell className="max-w-40 truncate font-medium" title={row.identifier}>
                  {row.identifier}
                </TableCell>
                <TableCell className="max-w-56 truncate font-medium" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground" title={row.recipientName}>
                  {row.recipientName}
                </TableCell>
                <TableCell className="max-w-[360px] truncate text-muted-foreground" title={address}>
                  {address}
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-muted-foreground">
                  {row.phoneNumber || "-"}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground">
                  {row.email || "-"}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(row)}
                      aria-label="Edit"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: `Delete "${row.name}"?`,
                            confirmLabel: "Delete",
                            variant: "destructive",
                          });
                          if (ok) onDelete(row);
                        })();
                      }}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
