import axios from "axios";

export function apiErrorMessage(e: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { message?: string; issues?: unknown } | undefined;
    if (data?.message) return data.message;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}
