"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WarningDisregardDialog } from "@/components/po/warnings/warning-disregard-dialog";
import { WarningsTable } from "@/components/po/warnings/warnings-table";
import { toast } from "sonner";
import {
  LIST_FILTER_ALL_VALUE,
  useDebouncedValue,
  useListFilterState,
} from "@/hooks/use-list-filters";
import {
  OPERATOR_WARNING_TIER_LABELS,
  OPERATOR_WARNING_TIERS,
  OPERATOR_WARNING_TYPE_LABELS,
  OPERATOR_WARNING_TYPES,
} from "@/lib/operator-warnings/labels";
import type {
  OperatorWarningRow,
  OperatorWarningStatus,
  OperatorWarningsResponse,
} from "@/lib/types/api";

const warningsKey = ["warnings"] as const;
const navCountsKey = ["nav-counts"] as const;
const defaultPage = 1;
const defaultPageSize = 25;

type WarningFilters = Record<"tier" | "type", string>;

const warningFilterDefaults: WarningFilters = {
  tier: LIST_FILTER_ALL_VALUE,
  type: LIST_FILTER_ALL_VALUE,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatScanTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function scanStatusLabel(status: string | null) {
  if (!status) return "Not scanned";
  if (status === "success") return "Succeeded";
  if (status === "error") return "Failed";
  if (status === "running") return "Running";
  return status;
}

export function WarningsView() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OperatorWarningStatus>("open");
  const [page, setPageState] = useState(defaultPage);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [disregardRow, setDisregardRow] = useState<OperatorWarningRow | null>(null);
  const filters = useListFilterState({ initialFilters: warningFilterDefaults });
  const debouncedSearch = useDebouncedValue(filters.search);

  const queryKey = [
    ...warningsKey,
    status,
    debouncedSearch,
    filters.filters.tier,
    filters.filters.type,
    page,
    pageSize,
  ] as const;

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const q = debouncedSearch.trim();
      if (q) params.set("q", q);
      if (filters.filters.tier !== LIST_FILTER_ALL_VALUE) params.set("tier", filters.filters.tier);
      if (filters.filters.type !== LIST_FILTER_ALL_VALUE) params.set("type", filters.filters.type);
      const { data: payload } = await api.get<OperatorWarningsResponse>(
        `/api/warnings?${params.toString()}`,
      );
      return payload;
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const totalItems = data?.total ?? 0;
  const pageCount = Math.max(Math.ceil(totalItems / pageSize), 1);
  const safePage = clamp(page, 1, pageCount);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = totalItems === 0 ? 0 : Math.min(startIndex + pageSize, totalItems);
  const isTablePending = isPending && rows.length === 0;

  useEffect(() => {
    if (page === safePage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageState(safePage);
  }, [page, safePage]);

  const setPage = useCallback(
    (next: number) => {
      setPageState(clamp(next, 1, pageCount));
    },
    [pageCount],
  );

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(Math.max(next, 1));
    setPageState(defaultPage);
  }, []);

  const resetPage = useCallback(() => {
    setPageState(defaultPage);
  }, []);

  const pagination = useMemo(
    () => ({
      page: safePage,
      pageSize,
      pageCount,
      totalItems,
      startIndex,
      endIndex,
      setPage,
      setPageSize,
    }),
    [endIndex, pageCount, pageSize, safePage, setPage, setPageSize, startIndex, totalItems],
  );

  const invalidateWarningQueries = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: warningsKey }),
      qc.invalidateQueries({ queryKey: navCountsKey }),
    ]);
  }, [qc]);

  const resyncAllMut = useMutation({
    mutationFn: async () => {
      const { data: result } = await api.post("/api/warnings/resync");
      return result;
    },
    onSuccess: async () => {
      await invalidateWarningQueries();
      toast.success("Warnings resynced");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const resyncRowMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: result } = await api.post<{
        deleted: boolean;
        warning: OperatorWarningRow | null;
      }>(`/api/warnings/${id}/resync`);
      return result;
    },
    onSuccess: async (result) => {
      await invalidateWarningQueries();
      if (result.deleted) {
        toast.success("Warning cleared");
        return;
      }
      toast.success(
        result.warning?.issuePresent ? "Warning is still present" : "Issue is no longer present",
      );
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const disregardMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: row } = await api.post<OperatorWarningRow>(`/api/warnings/${id}/disregard`, {
        reason,
      });
      return row;
    },
    onSuccess: async () => {
      setDisregardRow(null);
      await invalidateWarningQueries();
      toast.success("Warning disregarded");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const scan = data?.scan ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warnings</h1>
          <p className="text-sm text-muted-foreground">
            Last scan {formatScanTime(scan?.lastFinishedAt ?? null)} · {scanStatusLabel(scan?.lastStatus ?? null)}
            {scan?.lastStatus === "error" && scan.lastError ? ` · ${scan.lastError}` : ""}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => resyncAllMut.mutate()}
          disabled={resyncAllMut.isPending}
        >
          <RefreshCw className={resyncAllMut.isPending ? "size-4 animate-spin" : "size-4"} />
          Resync all
        </Button>
      </div>

      <TableContainer
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value as OperatorWarningStatus);
            resetPage();
          }}
          className="gap-0"
        >
          <TabsList variant="underline">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="disregarded">Disregarded</TabsTrigger>
          </TabsList>
        </Tabs>
        <ListFilters
          className="border-b border-border/80 bg-muted/20"
          searchValue={filters.search}
          onSearchChange={(value) => {
            filters.setSearch(value);
            resetPage();
          }}
          searchAriaLabel="Search warnings"
          searchPlaceholder="Search warnings..."
          selects={[
            {
              key: "tier",
              value: filters.filters.tier,
              onValueChange: (value) => {
                filters.setFilter("tier", value);
                resetPage();
              },
              allLabel: "All tiers",
              ariaLabel: "Filter by tier",
              placeholder: "Tier",
              options: OPERATOR_WARNING_TIERS.map((tier) => ({
                value: tier,
                label: OPERATOR_WARNING_TIER_LABELS[tier],
              })),
            },
            {
              key: "type",
              value: filters.filters.type,
              onValueChange: (value) => {
                filters.setFilter("type", value);
                resetPage();
              },
              allLabel: "All types",
              ariaLabel: "Filter by type",
              placeholder: "Type",
              options: OPERATOR_WARNING_TYPES.map((type) => ({
                value: type,
                label: OPERATOR_WARNING_TYPE_LABELS[type],
              })),
            },
          ]}
          hasActiveFilters={filters.hasActiveFilters}
          onClear={() => {
            filters.resetFilters();
            resetPage();
          }}
          resultCount={totalItems}
          totalCount={totalItems}
        />
        <WarningsTable
          rows={rows}
          status={status}
          isPending={isTablePending}
          emptyMessage={
            filters.hasActiveFilters
              ? "No warnings match your filters."
              : status === "open"
                ? "No open warnings."
                : "No disregarded warnings."
          }
          resyncingId={resyncRowMut.isPending ? (resyncRowMut.variables ?? null) : null}
          onResync={(row) => resyncRowMut.mutate(row.id)}
          onDisregard={setDisregardRow}
        />
      </TableContainer>

      <WarningDisregardDialog
        key={disregardRow?.id ?? "closed"}
        open={Boolean(disregardRow)}
        title={disregardRow?.title ?? ""}
        pending={disregardMut.isPending}
        onOpenChange={(open) => {
          if (!open && !disregardMut.isPending) setDisregardRow(null);
        }}
        onSubmit={(reason) => {
          if (!disregardRow) return;
          disregardMut.mutate({ id: disregardRow.id, reason });
        }}
      />
    </div>
  );
}
