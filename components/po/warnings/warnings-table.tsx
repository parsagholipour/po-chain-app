"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
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
import {
  OPERATOR_WARNING_TIER_LABELS,
  OPERATOR_WARNING_TYPE_LABELS,
} from "@/lib/operator-warnings/labels";
import type { OperatorWarningRow, OperatorWarningStatus } from "@/lib/types/api";

type Props = {
  rows: OperatorWarningRow[];
  status: OperatorWarningStatus;
  isPending: boolean;
  emptyMessage: string;
  resyncingId: string | null;
  onResync: (row: OperatorWarningRow) => void;
  onDisregard: (row: OperatorWarningRow) => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function tierBadgeClass(tier: OperatorWarningRow["tier"]) {
  if (tier === "critical") return "border-transparent bg-destructive/15 text-destructive";
  if (tier === "high") return "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-400";
  if (tier === "medium") return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-400";
  return "";
}

function disregardedByLabel(row: OperatorWarningRow) {
  return row.disregardedBy?.name?.trim() || row.disregardedBy?.email || "Unknown";
}

export function WarningsTable({
  rows,
  status,
  isPending,
  emptyMessage,
  resyncingId,
  onResync,
  onDisregard,
}: Props) {
  const showDisregarded = status === "disregarded";
  const columnCount = showDisregarded ? 9 : 6;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[92px]">Tier</TableHead>
          <TableHead className="w-[180px]">Type</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="w-[160px]">Last checked</TableHead>
          {showDisregarded ? <TableHead>Reason</TableHead> : null}
          {showDisregarded ? <TableHead className="w-[140px]">By</TableHead> : null}
          {showDisregarded ? <TableHead className="w-[160px]">Disregarded</TableHead> : null}
          <TableHead className="w-[168px] text-end">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
              Loading…
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Badge
                  variant={row.tier === "low" ? "outline" : "secondary"}
                  className={tierBadgeClass(row.tier)}
                >
                  {OPERATOR_WARNING_TIER_LABELS[row.tier]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {OPERATOR_WARNING_TYPE_LABELS[row.type]}
              </TableCell>
              <TableCell className="max-w-[220px]">
                {row.href ? (
                  <Link href={row.href} className="font-medium underline-offset-4 hover:underline">
                    {row.title}
                  </Link>
                ) : (
                  <span className="font-medium">{row.title}</span>
                )}
              </TableCell>
              <TableCell className="max-w-[320px] text-muted-foreground">
                <span className="line-clamp-2" title={row.message}>
                  {row.message}
                </span>
                {showDisregarded ? (
                  <span className="mt-1 block text-xs">
                    {row.issuePresent ? "Still present" : "Since fixed"}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(row.lastCheckedAt)}
              </TableCell>
              {showDisregarded ? (
                <TableCell className="max-w-[240px] text-muted-foreground">
                  <span className="line-clamp-2" title={row.disregardReason ?? undefined}>
                    {row.disregardReason ?? "—"}
                  </span>
                </TableCell>
              ) : null}
              {showDisregarded ? (
                <TableCell className="max-w-[140px] truncate text-muted-foreground" title={disregardedByLabel(row)}>
                  {disregardedByLabel(row)}
                </TableCell>
              ) : null}
              {showDisregarded ? (
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(row.disregardedAt)}
                </TableCell>
              ) : null}
              <TableCell className="text-end">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resyncingId === row.id}
                    onClick={() => onResync(row)}
                  >
                    <RefreshCw className="size-3.5" />
                    Resync
                  </Button>
                  {status === "open" ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onDisregard(row)}>
                      Disregard
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
