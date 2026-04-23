"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type UsePaginationOptions = {
  totalItems: number;
  initialPage?: number;
  initialPageSize?: number;
  resetDeps?: readonly unknown[];
};

export function usePagination({
  totalItems,
  initialPage = DEFAULT_PAGE,
  initialPageSize = DEFAULT_PAGE_SIZE,
  resetDeps = [],
}: UsePaginationOptions) {
  const [page, setPageState] = useState(() => Math.max(initialPage, DEFAULT_PAGE));
  const [pageSize, setPageSizeState] = useState(() => Math.max(initialPageSize, 1));

  const safeTotalItems = Math.max(totalItems, 0);
  const pageCount = Math.max(Math.ceil(safeTotalItems / pageSize), 1);
  const safePage = clamp(page, 1, pageCount);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageState((current) => clamp(current, 1, pageCount));
  }, [pageCount]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageState(1);
  }, resetDeps);

  const setPage = useCallback((next: number) => {
    setPageState(clamp(next, 1, pageCount));
  }, [pageCount]);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(Math.max(next, 1));
    setPageState(1);
  }, []);

  const startIndex = safeTotalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = safeTotalItems === 0 ? 0 : Math.min(startIndex + pageSize, safeTotalItems);

  const sliceItems = useCallback(<T,>(items: readonly T[]) => {
    return items.slice(startIndex, endIndex);
  }, [startIndex, endIndex]);

  return useMemo(
    () => ({
      page: safePage,
      pageSize,
      pageCount,
      totalItems: safeTotalItems,
      startIndex,
      endIndex,
      setPage,
      setPageSize,
      sliceItems,
    }),
    [safePage, pageSize, pageCount, safeTotalItems, startIndex, endIndex, setPage, setPageSize, sliceItems]
  );
}
