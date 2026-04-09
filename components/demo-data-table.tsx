"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Row = { id: string; sku: string; name: string; status: "in_stock" | "low" };

const data: Row[] = [
  { id: "1", sku: "SKU-100", name: "Teal notebook", status: "in_stock" },
  { id: "2", sku: "SKU-220", name: "Desk lamp", status: "low" },
  { id: "3", sku: "SKU-305", name: "Wireless mouse", status: "in_stock" },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: "sku", header: "SKU" },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const v = getValue<Row["status"]>();
      return (
        <Badge variant={v === "low" ? "destructive" : "default"}>
          {v === "low" ? "Low stock" : "In stock"}
        </Badge>
      );
    },
  },
];

export function DemoDataTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>TanStack Table</CardTitle>
        <CardDescription>
          Client-side column definitions with shadcn table primitives.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
