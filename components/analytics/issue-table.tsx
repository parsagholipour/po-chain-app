"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import type { QualityIssueRow } from "@/lib/types/analytics";

export function IssueTable({ rows }: { rows: QualityIssueRow[] }) {
  const pagination = usePagination({ totalItems: rows.length });
  const pagedRows = pagination.sliceItems(rows);

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                No issues found.
              </TableCell>
            </TableRow>
          ) : (
            pagedRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-muted-foreground">{row.note}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="border-t border-border/60 px-3 py-2">
        <TablePagination
          {...pagination}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>
    </div>
  );
}
