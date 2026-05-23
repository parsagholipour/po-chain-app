import axios from "axios";

function resolveBaseURL(): string | undefined {
  // In the browser, always call the same origin. NEXT_PUBLIC_APP_URL may still
  // point at :4000 while `next dev` is actually serving on :4001 (EADDRINUSE).
  if (typeof window !== "undefined") return "";

  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:4000";
}

export const api = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);
