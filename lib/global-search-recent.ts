import type { GlobalSearchScope } from "@/lib/global-search-scopes";

const STORAGE_KEY = "po-app:global-search-recent";
const MAX = 10;

export type RecentSearchEntry = {
  query: string;
  scope: GlobalSearchScope | null;
  ts: number;
};

function safeParse(raw: string | null): RecentSearchEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (e): e is RecentSearchEntry =>
          e &&
          typeof e === "object" &&
          typeof (e as RecentSearchEntry).query === "string" &&
          typeof (e as RecentSearchEntry).ts === "number",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function readRecentSearches(): RecentSearchEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function writeRecentSearches(entries: RecentSearchEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX)));
}

export function pushRecentSearch(entry: Omit<RecentSearchEntry, "ts"> & { ts?: number }) {
  const ts = entry.ts ?? Date.now();
  const prev = readRecentSearches();
  const next = [
    { query: entry.query, scope: entry.scope, ts },
    ...prev.filter((e) => e.query !== entry.query || e.scope !== entry.scope),
  ].slice(0, MAX);
  writeRecentSearches(next);
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
