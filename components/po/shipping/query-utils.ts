"use client";

import type { QueryClient } from "@tanstack/react-query";
import { invalidateNavCounts } from "@/lib/query-invalidation";

export async function invalidateShippingRelatedQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["shipping"] }),
    queryClient.invalidateQueries({ queryKey: ["manufacturing-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["manufacturing-order"] }),
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["purchase-order"] }),
    queryClient.invalidateQueries({ queryKey: ["stock-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["stock-order"] }),
    invalidateNavCounts(queryClient),
  ]);
}

export async function invalidateLogisticsPartnerQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["logistics-partners"] }),
    queryClient.invalidateQueries({ queryKey: ["shipping"] }),
  ]);
}
