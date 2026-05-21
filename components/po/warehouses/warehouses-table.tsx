"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Warehouse } from "@/lib/types/api";

type Props = {
  rows: Warehouse[];
  isPending: boolean;
  onEdit: (row: Warehouse) => void;
  onDelete: (row: Warehouse) => void;
};

export function WarehousesTable({ rows, isPending, onEdit, onDelete }: Props) {
  const confirm = useConfirm();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="max-w-[180px]">Sale channel</TableHead>
          <TableHead className="max-w-[220px]">Address</TableHead>
          <TableHead className="max-w-[140px]">Phone</TableHead>
          <TableHead className="max-w-[180px]">Email</TableHead>
          <TableHead className="w-[120px] text-end">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
              Loading...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
              No warehouses yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-56 truncate font-medium" title={row.name}>
                {row.name}
              </TableCell>
              <TableCell
                className="max-w-[180px] truncate text-muted-foreground"
                title={row.saleChannel?.name ?? undefined}
              >
                {row.saleChannel?.name ?? "-"}
              </TableCell>
              <TableCell
                className="max-w-[220px] truncate text-muted-foreground"
                title={row.address ?? undefined}
              >
                {row.address ?? "-"}
              </TableCell>
              <TableCell
                className="max-w-[140px] truncate text-muted-foreground"
                title={row.phoneNumber ?? undefined}
              >
                {row.phoneNumber ?? "-"}
              </TableCell>
              <TableCell
                className="max-w-[180px] truncate text-muted-foreground"
                title={row.email ?? undefined}
              >
                {row.email ?? "-"}
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
          ))
        )}
      </TableBody>
    </Table>
  );
}
