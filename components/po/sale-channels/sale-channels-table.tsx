"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { useConfirm } from "@/components/confirm-provider";
import type { SaleChannel } from "@/lib/types/api";
import { saleChannelTypeLabels } from "@/lib/po/sale-channel-labels";
import { Pencil, Trash2 } from "lucide-react";

type Props = {
  rows: SaleChannel[];
  isPending: boolean;
  onEdit: (row: SaleChannel) => void;
  onDelete: (row: SaleChannel) => void;
};

export function SaleChannelsTable({ rows, isPending, onEdit, onDelete }: Props) {
  const confirm = useConfirm();

  return (
    <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Logo</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="max-w-[140px]">Contact number</TableHead>
            <TableHead className="max-w-[160px]">Email</TableHead>
            <TableHead className="w-[120px] text-end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No sale channels yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <StorageObjectImage
                    reference={row.logoKey}
                    className="size-8 shrink-0"
                    objectFit="cover"
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{saleChannelTypeLabels[row.type]}</Badge>
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-muted-foreground">
                  {row.contactNumber?.trim() || "—"}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground">
                  {row.email?.trim() || "—"}
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
                            title: `Delete “${row.name}”?`,
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
            ))
          )}
        </TableBody>
      </Table>
  );
}
