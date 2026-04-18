"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";

type NavCounts = {
  purchaseOrders: number;
  stockOrders: number;
  manufacturingOrders: number;
};

export function useNavCounts() {
  return useQuery<NavCounts>({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const { data } = await api.get<NavCounts>("/api/nav-counts");
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
