"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const LIST_FILTER_ALL_VALUE = "all";

type UseListFilterStateOptions<TFilterKey extends string> = {
  initialFilters: Record<TFilterKey, string>;
  initialSearch?: string;
  allValue?: string;
};

export function normalizeListFilterText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function useDebouncedValue<TValue>(value: TValue, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function useListFilterState<TFilterKey extends string>({
  initialFilters,
  initialSearch = "",
  allValue = LIST_FILTER_ALL_VALUE,
}: UseListFilterStateOptions<TFilterKey>) {
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<Record<TFilterKey, string>>(initialFilters);

  const setFilter = useCallback((key: TFilterKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch(initialSearch);
    setFilters(initialFilters);
  }, [initialFilters, initialSearch]);

  const hasActiveFilters = useMemo(
    () =>
      normalizeListFilterText(search).length > 0 ||
      Object.values<string>(filters).some((value) => value !== allValue),
    [allValue, filters, search],
  );

  return useMemo(
    () => ({
      search,
      setSearch,
      filters,
      setFilter,
      resetFilters,
      hasActiveFilters,
    }),
    [filters, hasActiveFilters, resetFilters, search, setFilter],
  );
}
