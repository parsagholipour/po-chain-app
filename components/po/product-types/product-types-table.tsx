"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProductType } from "@/lib/types/api";

type Props = {
  rows: ProductType[];
  isPending: boolean;
  onEdit: (row: ProductType) => void;
  onDelete: (row: ProductType) => void;
};

export function ProductTypesTable({ rows, isPending, onEdit, onDelete }: Props) {
  if (isPending) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No product types found.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(row)}
                  title="Edit"
                >
                  <Edit2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this type?")) {
                      onDelete(row);
                    }
                  }}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
