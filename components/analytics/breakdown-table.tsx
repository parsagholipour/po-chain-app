import { PriceView } from "@/components/ui/price-view";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BreakdownRow } from "@/lib/types/analytics";

export function BreakdownTable({
  rows,
  emptyMessage = "No data for selected filters.",
}: {
  rows: BreakdownRow[];
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Segment</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Margin %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right">
                  <PriceView value={row.revenue} />
                </TableCell>
                <TableCell className="text-right">
                  <PriceView value={row.cost} />
                </TableCell>
                <TableCell className="text-right">
                  <PriceView value={row.profit} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.units.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{row.marginPct.toFixed(1)}%</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
