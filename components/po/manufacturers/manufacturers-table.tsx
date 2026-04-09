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
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import type { Manufacturer } from "@/lib/types/api";
import { useConfirm } from "@/components/confirm-provider";
import { Pencil, Trash2 } from "lucide-react";

type Props = {
  rows: Manufacturer[];
  isPending: boolean;
  onEdit: (row: Manufacturer) => void;
  onDelete: (row: Manufacturer) => void;
};

export function ManufacturersTable({ rows, isPending, onEdit, onDelete }: Props) {
  const confirm = useConfirm();

  return (
    <div className="rounded-xl border border-border/80">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Logo</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="w-[120px] text-end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No manufacturers yet.
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
                <TableCell>{row.region}</TableCell>
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
    </div>
  );
}
