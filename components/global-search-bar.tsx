"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { History, Loader2, Search, X } from "lucide-react";
import { api } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  Manufacturer,
  ManufacturingOrderSummary,
  Product,
  PurchaseOrderSummary,
  RecommendedOpenItem,
  SaleChannel,
  ShippingRow,
} from "@/lib/types/api";
import { distributorPoStatusLabels, moStatusLabels } from "@/lib/po/status-labels";
import { GLOBAL_SEARCH_SCOPES, type GlobalSearchScope, scopeLabel } from "@/lib/global-search-scopes";
import {
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
  type RecentSearchEntry,
} from "@/lib/global-search-recent";
import { looksLikeUuid } from "@/lib/url-id-param";

const DEBOUNCE_MS = 280;
const MAX_SECTION = 6;

const panelEase = [0.25, 0.1, 0.25, 1] as const;
const panelTransition = { duration: 0.18, ease: panelEase };
const crossfadeTransition = { duration: 0.16, ease: panelEase };

type Hit =
  | { kind: "po"; id: string; title: string; subtitle: string }
  | { kind: "mo"; id: string; title: string; subtitle: string }
  | { kind: "so"; id: string; title: string; subtitle: string }
  | { kind: "manufacturer"; id: string; title: string; subtitle: string }
  | { kind: "product"; id: string; title: string; subtitle: string }
  | { kind: "shipping"; id: string; title: string; subtitle: string }
  | { kind: "sale_channel"; id: string; title: string; subtitle: string };

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (typeof value === "string" && (value as string).trim() === "") {
      queueMicrotask(() => setV(value));
      return;
    }
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

function hitHref(hit: Hit): string {
  switch (hit.kind) {
    case "po":
      return `/purchase-orders/${hit.id}`;
    case "mo":
      return `/manufacturing-orders/${hit.id}`;
    case "so":
      return `/stock-orders/${hit.id}`;
    case "manufacturer":
      return `/manufacturers?id=${hit.id}`;
    case "product":
      return `/products?id=${hit.id}`;
    case "shipping":
      return `/shipping?id=${hit.id}`;
    case "sale_channel":
      return `/sale-channels?id=${hit.id}`;
  }
}

function shippingSubtitle(row: ShippingRow): string {
  const ord = row.orders?.[0];
  const bits = [row.trackingNumber, ord?.name, row.status].filter(Boolean);
  return bits.join(" · ") || row.id.slice(0, 8);
}

function recommendedItemHref(item: RecommendedOpenItem): string {
  switch (item.kind) {
    case "po":
      return `/purchase-orders/${item.id}`;
    case "mo":
      return `/manufacturing-orders/${item.id}`;
    case "so":
      return `/stock-orders/${item.id}`;
  }
}

function recommendedSubtitle(item: RecommendedOpenItem): string {
  const statusLabel =
    item.kind === "mo"
      ? (moStatusLabels[item.status] ?? item.status)
      : (distributorPoStatusLabels[item.status] ?? item.status);
  const kindLabel = item.kind === "po" ? "PO" : item.kind === "so" ? "Stock order" : "MO";
  return `${kindLabel} · ${statusLabel} · #${item.number}`;
}

export function GlobalSearchBar() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  /** When set, drives search + query keys immediately (e.g. recent pick) until debounce matches. */
  const [burstQuery, setBurstQuery] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeScope, setActiveScope] = useState<GlobalSearchScope | null>(null);
  const [recent, setRecent] = useState<RecentSearchEntry[]>([]);

  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  /** Empty input updates immediately; non-empty still uses debounce (or burst) so API calls stay throttled. */
  const q =
    query.trim() === ""
      ? ""
      : burstQuery !== null
        ? burstQuery.trim()
        : debouncedQuery.trim();
  const searchActive = panelOpen && q.length > 0;

  const { data: recommendedItems = [], isPending: recommendedPending } = useQuery({
    queryKey: ["recommended-open"],
    queryFn: async () => {
      const { data } = await api.get<{ items: RecommendedOpenItem[] }>("/api/recommended-open");
      return data.items;
    },
    enabled: panelOpen && !searchActive,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (burstQuery !== null && debouncedQuery.trim() === burstQuery.trim()) {
      queueMicrotask(() => setBurstQuery(null));
    }
  }, [debouncedQuery, burstQuery]);

  const scopePo = !activeScope || activeScope === "po";
  const scopeMo = !activeScope || activeScope === "mo";
  const scopeSo = !activeScope || activeScope === "so";
  const scopeManufacturer = !activeScope || activeScope === "manufacturer";
  const scopeProduct = !activeScope || activeScope === "product";
  const scopeShipping = !activeScope || activeScope === "shipping";
  const scopeSaleChannel = !activeScope || activeScope === "sale_channel";

  const refreshRecentAndOpenPanel = useCallback(() => {
    setRecent(readRecentSearches());
    setPanelOpen(true);
  }, []);

  const focusSearchInput = useCallback(() => {
    refreshRecentAndOpenPanel();
    queueMicrotask(() => inputRef.current?.focus());
  }, [refreshRecentAndOpenPanel]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "k" && e.key !== "K") return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && inputRef.current && (el === inputRef.current || inputRef.current.contains(el))) {
        return;
      }
      if (el?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      e.preventDefault();
      focusSearchInput();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusSearchInput]);

  useEffect(() => {
    if (!panelOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPanelOpen(false);
        setBurstQuery(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [panelOpen]);

  const orderQueries = useQueries({
    queries: [
      {
        queryKey: ["global-search", "po", q] as const,
        queryFn: async () => {
          const { data } = await api.get<PurchaseOrderSummary[]>("/api/purchase-orders", {
            params: { q },
          });
          return data;
        },
        enabled: searchActive && scopePo,
        staleTime: 30_000,
      },
      {
        queryKey: ["global-search", "mo", q] as const,
        queryFn: async () => {
          const { data } = await api.get<ManufacturingOrderSummary[]>("/api/manufacturing-orders", {
            params: { q },
          });
          return data;
        },
        enabled: searchActive && scopeMo,
        staleTime: 30_000,
      },
      {
        queryKey: ["global-search", "so", q] as const,
        queryFn: async () => {
          const { data } = await api.get<PurchaseOrderSummary[]>("/api/stock-orders", {
            params: { q },
          });
          return data;
        },
        enabled: searchActive && scopeSo,
        staleTime: 30_000,
      },
    ],
  });

  const poRows = orderQueries[0].data as PurchaseOrderSummary[] | undefined;
  const moRows = orderQueries[1].data as ManufacturingOrderSummary[] | undefined;
  const soRows = orderQueries[2].data as PurchaseOrderSummary[] | undefined;
  /** Only count queries that are enabled for the current scope (disabled queries can stay `isPending`). */
  const ordersLoading =
    searchActive &&
    ((scopePo && (orderQueries[0].isFetching || orderQueries[0].isPending)) ||
      (scopeMo && (orderQueries[1].isFetching || orderQueries[1].isPending)) ||
      (scopeSo && (orderQueries[2].isFetching || orderQueries[2].isPending)));

  const masterDataQueries = useQueries({
    queries: [
      {
        queryKey: ["global-search", "manufacturers"] as const,
        queryFn: async () => {
          const { data } = await api.get<Manufacturer[]>("/api/manufacturers");
          return data;
        },
        enabled: searchActive && scopeManufacturer,
        staleTime: 60_000,
      },
      {
        queryKey: ["global-search", "products"] as const,
        queryFn: async () => {
          const { data } = await api.get<Product[]>("/api/products");
          return data;
        },
        enabled: searchActive && scopeProduct,
        staleTime: 60_000,
      },
      {
        queryKey: ["global-search", "sale-channels"] as const,
        queryFn: async () => {
          const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
          return data;
        },
        enabled: searchActive && scopeSaleChannel,
        staleTime: 60_000,
      },
    ],
  });

  const manufacturersList = masterDataQueries[0].data as Manufacturer[] | undefined;
  const productsList = masterDataQueries[1].data as Product[] | undefined;
  const saleChannelsList = masterDataQueries[2].data as SaleChannel[] | undefined;
  const masterLoading =
    searchActive &&
    ((scopeManufacturer &&
      (masterDataQueries[0].isFetching || masterDataQueries[0].isPending)) ||
      (scopeProduct && (masterDataQueries[1].isFetching || masterDataQueries[1].isPending)) ||
      (scopeSaleChannel && (masterDataQueries[2].isFetching || masterDataQueries[2].isPending)));

  const shippingUuidQuery = useQuery({
    queryKey: ["global-search", "shipping", "id", q] as const,
    queryFn: async () => {
      const { data } = await api.get<ShippingRow>(`/api/shipping/${q}`);
      return data;
    },
    enabled: searchActive && scopeShipping && looksLikeUuid(q),
    retry: false,
  });

  const shippingTextQuery = useQuery({
    queryKey: ["global-search", "shipping", "q", q] as const,
    queryFn: async () => {
      const { data } = await api.get<ShippingRow[]>("/api/shipping", { params: { q } });
      return data;
    },
    enabled: searchActive && scopeShipping && !looksLikeUuid(q),
    staleTime: 30_000,
  });

  const shippingLoading =
    searchActive &&
    scopeShipping &&
    (looksLikeUuid(q)
      ? shippingUuidQuery.isFetching || shippingUuidQuery.isPending
      : shippingTextQuery.isFetching || shippingTextQuery.isPending);

  const hits = useMemo((): Hit[] => {
    if (!searchActive) return [];
    const ql = q.toLowerCase();
    const out: Hit[] = [];

    if (scopePo && poRows) {
      for (const row of poRows.slice(0, MAX_SECTION)) {
        out.push({
          kind: "po",
          id: row.id,
          title: row.name,
          subtitle: row.saleChannel?.name ? `PO · ${row.saleChannel.name}` : "PO",
        });
      }
    }
    if (scopeMo && moRows) {
      for (const row of moRows.slice(0, MAX_SECTION)) {
        out.push({
          kind: "mo",
          id: row.id,
          title: row.name,
          subtitle: "Manufacturing order",
        });
      }
    }
    if (scopeSo && soRows) {
      for (const row of soRows.slice(0, MAX_SECTION)) {
        out.push({
          kind: "so",
          id: row.id,
          title: row.name,
          subtitle: "Stock order",
        });
      }
    }

    if (scopeManufacturer && manufacturersList) {
      for (const row of manufacturersList) {
        if (out.filter((h) => h.kind === "manufacturer").length >= MAX_SECTION) break;
        if (
          row.name.toLowerCase().includes(ql) ||
          row.id.toLowerCase() === ql ||
          (looksLikeUuid(q) && row.id === q)
        ) {
          out.push({
            kind: "manufacturer",
            id: row.id,
            title: row.name,
            subtitle: "Manufacturer",
          });
        }
      }
    }

    if (scopeProduct && productsList) {
      for (const row of productsList) {
        if (out.filter((h) => h.kind === "product").length >= MAX_SECTION) break;
        if (
          row.name.toLowerCase().includes(ql) ||
          row.sku.toLowerCase().includes(ql) ||
          row.id.toLowerCase() === ql ||
          (looksLikeUuid(q) && row.id === q)
        ) {
          out.push({
            kind: "product",
            id: row.id,
            title: row.name,
            subtitle: row.sku ? `SKU ${row.sku}` : "Product",
          });
        }
      }
    }

    if (scopeSaleChannel && saleChannelsList) {
      for (const row of saleChannelsList) {
        if (out.filter((h) => h.kind === "sale_channel").length >= MAX_SECTION) break;
        if (row.name.toLowerCase().includes(ql) || row.id.toLowerCase() === ql || (looksLikeUuid(q) && row.id === q)) {
          out.push({
            kind: "sale_channel",
            id: row.id,
            title: row.name,
            subtitle: "Sales channel",
          });
        }
      }
    }

    if (scopeShipping) {
      if (looksLikeUuid(q) && shippingUuidQuery.data) {
        const row = shippingUuidQuery.data;
        out.push({
          kind: "shipping",
          id: row.id,
          title: row.trackingNumber || `Shipping ${row.id.slice(0, 8)}…`,
          subtitle: shippingSubtitle(row),
        });
      } else if (!looksLikeUuid(q) && shippingTextQuery.data) {
        for (const row of shippingTextQuery.data.slice(0, MAX_SECTION)) {
          out.push({
            kind: "shipping",
            id: row.id,
            title: row.trackingNumber || `Shipping ${row.id.slice(0, 8)}…`,
            subtitle: shippingSubtitle(row),
          });
        }
      }
    }

    return out;
  }, [
    searchActive,
    q,
    scopePo,
    scopeMo,
    scopeSo,
    scopeManufacturer,
    scopeProduct,
    scopeShipping,
    scopeSaleChannel,
    poRows,
    moRows,
    soRows,
    manufacturersList,
    productsList,
    saleChannelsList,
    shippingUuidQuery.data,
    shippingTextQuery.data,
  ]);

  const loading =
    searchActive &&
    (ordersLoading ||
      masterLoading ||
      (scopeShipping && shippingLoading && !shippingUuidQuery.isError));

  /** Do not hide hits while other parallel queries are still in flight (cross-entity search). */
  const showSpinner = searchActive && loading && hits.length === 0;
  const showEmpty = searchActive && !loading && hits.length === 0;
  const showMoreHint = searchActive && loading && hits.length > 0;

  function navigateToHit(hit: Hit) {
    pushRecentSearch({ query: q, scope: activeScope });
    router.push(hitHref(hit));
    setPanelOpen(false);
    setQuery("");
    setBurstQuery(null);
  }

  function navigateRecommended(item: RecommendedOpenItem) {
    router.push(recommendedItemHref(item));
    setPanelOpen(false);
    setQuery("");
    setBurstQuery(null);
  }

  function onRecentClick(entry: RecentSearchEntry) {
    setQuery(entry.query);
    setBurstQuery(entry.query);
    setActiveScope(entry.scope);
    queueMicrotask(() => inputRef.current?.focus());
  }

  function toggleScope(scope: GlobalSearchScope) {
    setActiveScope((prev) => (prev === scope ? null : scope));
    queueMicrotask(() => inputRef.current?.focus());
  }

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-xl min-w-0">
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border border-border dark:bg-muted/20 px-2.5 shadow-sm transition-shadow",
          panelOpen && "ring-2 ring-ring/30",
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setBurstQuery(null);
            setQuery(e.target.value);
          }}
          onFocus={() => refreshRecentAndOpenPanel()}
          placeholder="Search"
          className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          aria-expanded={panelOpen}
          aria-controls="global-search-panel"
          autoComplete="off"
        />
        {query.trim().length > 0 ? (
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
            title="Clear search"
            aria-label="Clear search"
            onClick={(e) => {
              e.preventDefault();
              setBurstQuery(null);
              setQuery("");
              queueMicrotask(() => inputRef.current?.focus());
            }}
          >
            <X className="size-4" strokeWidth={2.75} aria-hidden />
          </button>
        ) : null}
        {!panelOpen ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-0 rounded-md border border-border/80 bg-muted/40 p-0.5 hover:bg-muted/70"
            title="Focus search (Ctrl+K or ⌘K)"
            aria-label="Focus search, keyboard shortcut Ctrl K"
            onClick={(e) => {
              e.preventDefault();
              focusSearchInput();
            }}
          >
            <Badge
              variant="secondary"
              className="rounded-r-none border-0 bg-transparent px-1.5 py-0 text-[10px] font-semibold tracking-wide shadow-none"
            >
              CTRL
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-l-none border-0 bg-transparent px-1.5 py-0 text-[10px] font-semibold shadow-none"
            >
              K
            </Badge>
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {panelOpen ? (
          <motion.div
            id="global-search-panel"
            key="global-search-panel"
            role="listbox"
            aria-label="Search suggestions"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={panelTransition}
            className="absolute top-[calc(100%+6px)] left-0 right-0 z-50 max-h-[min(70vh,520px)] origin-top overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain">
              <div className="flex flex-wrap gap-1.5 border-b border-border/80 px-3 py-2.5">
                {GLOBAL_SEARCH_SCOPES.map(({ scope, label }) => {
                  const active = activeScope === scope;
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={cn(
                        "rounded-full border border-transparent px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-border bg-foreground/12 text-foreground shadow-sm"
                          : "border-transparent bg-muted text-foreground hover:border-border/50",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative min-h-[4.5rem]">
                <AnimatePresence mode="wait" initial={false}>
                  {searchActive ? (
                    <motion.div
                      key="search-body"
                      role="presentation"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={crossfadeTransition}
                      className="px-2 py-2"
                    >
                      {showSpinner ? (
                        <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Searching…
                        </div>
                      ) : null}
                      {showEmpty ? (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No results</p>
                      ) : null}
                      {hits.length > 0 ? (
                        <>
                          <ul className="space-y-0.5">
                            {hits.map((hit, index) => (
                              <motion.li
                                key={`${hit.kind}-${hit.id}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  ...crossfadeTransition,
                                  delay: Math.min(index, 6) * 0.03,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => navigateToHit(hit)}
                                  className="group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/80"
                                >
                                  <Badge
                                    variant="outline"
                                    className="mt-0.5 shrink-0 border-border/80 bg-background font-medium text-foreground shadow-sm transition-[box-shadow,border-color,background-color] group-hover:border-border group-hover:bg-background group-hover:shadow-md"
                                  >
                                    {scopeLabel(hit.kind)}
                                  </Badge>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{hit.title}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                                  </span>
                                </button>
                              </motion.li>
                            ))}
                          </ul>
                          {showMoreHint ? (
                            <p className="flex items-center gap-2 px-2 pt-2 text-xs text-muted-foreground">
                              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                              Loading more results…
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="browse-body"
                      role="presentation"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={crossfadeTransition}
                      className="space-y-4 px-3 py-3"
                    >
                      {recommendedPending || recommendedItems.length > 0 ? (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold tracking-wide text-muted-foreground">Recommended</p>
                            <span className="text-xs text-muted-foreground">Open · last updated</span>
                          </div>
                          {recommendedPending ? (
                            <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                              Loading…
                            </div>
                          ) : (
                            <ul className="space-y-0.5">
                              {recommendedItems.map((item, index) => (
                                <motion.li
                                  key={`${item.kind}-${item.id}`}
                                  initial={{ opacity: 0, x: -6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{
                                    ...crossfadeTransition,
                                    delay: Math.min(index, 6) * 0.03,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => navigateRecommended(item)}
                                    className="group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/80"
                                  >
                                    <Badge
                                      variant="outline"
                                      className="mt-0.5 shrink-0 border-border/80 bg-background font-medium text-foreground shadow-sm transition-[box-shadow,border-color,background-color] group-hover:border-border group-hover:bg-background group-hover:shadow-md"
                                    >
                                      {scopeLabel(item.kind)}
                                    </Badge>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-medium">{item.name}</span>
                                      <span className="block truncate text-xs text-muted-foreground">
                                        {recommendedSubtitle(item)}
                                      </span>
                                    </span>
                                  </button>
                                </motion.li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground">Recent searches</p>
                          {recent.length > 0 ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={() => {
                                clearRecentSearches();
                                setRecent([]);
                              }}
                            >
                              Clear history
                            </button>
                          ) : null}
                        </div>
                        {recent.length === 0 ? (
                          !recommendedPending && recommendedItems.length === 0 ? (
                            <p className="py-3 text-center text-sm text-muted-foreground">Type to search across the app</p>
                          ) : (
                            <p className="py-1 text-center text-xs text-muted-foreground">No recent searches yet</p>
                          )
                        ) : (
                          <ul className="space-y-0.5">
                            {recent.map((entry, i) => (
                              <motion.li
                                key={`${entry.query}-${entry.scope ?? "all"}-${entry.ts}-${i}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  ...crossfadeTransition,
                                  delay: Math.min(i, 8) * 0.03,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => onRecentClick(entry)}
                                  className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/80"
                                >
                                  <History
                                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                                    aria-hidden
                                  />
                                  {entry.scope ? (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 border-border/80 bg-background font-normal text-foreground shadow-sm transition-[box-shadow,border-color] group-hover:border-border group-hover:shadow-md"
                                    >
                                      {scopeLabel(entry.scope)}
                                    </Badge>
                                  ) : null}
                                  <span className="min-w-0 flex-1 truncate text-foreground">{entry.query}</span>
                                </button>
                              </motion.li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
