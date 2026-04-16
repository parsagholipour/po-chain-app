import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import { isAxiosError } from "axios";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: (query) => {
          if (
            isAxiosError(query.state.error) &&
            query.state.error.response?.status === 404
          ) {
            return false;
          }
          return "always";
        },
        refetchOnReconnect: (query) => {
          if (
            isAxiosError(query.state.error) &&
            query.state.error.response?.status === 404
          ) {
            return false;
          }
          return "always";
        },
        retry: (failureCount, error) => {
          if (isAxiosError(error) && error.response?.status === 404) {
            return false;
          }
          return failureCount < 3;
        },
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}
