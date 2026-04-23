import type { QueryClient } from "@tanstack/react-query";

export function invalidateNavCounts(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["nav-counts"] }),
    queryClient.invalidateQueries({ queryKey: ["recommended-open"] }),
  ]);
}
