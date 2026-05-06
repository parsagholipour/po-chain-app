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
import type { ProductCollection } from "@/lib/types/api";

type Props = {
  rows: ProductCollection[];
  isPending: boolean;
  onEdit: (row: ProductCollection) => void;
  onDelete: (row: ProductCollection) => void;
};

export function ProductCollectionsTable({ rows, isPending, onEdit, onDelete }: Props) {
  if (isPending) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No product collections found.</div>;
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
                    if (confirm("Are you sure you want to delete this collection?")) {
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
