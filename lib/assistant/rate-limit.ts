import "server-only";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RATE_LIMIT_WINDOW_MS = readIntEnv("ASSISTANT_RATE_LIMIT_WINDOW_MS", 60_000);
const RATE_LIMIT_MAX = readIntEnv("ASSISTANT_RATE_LIMIT_MAX", 8);

const globalForAssistant = globalThis as typeof globalThis & {
  __assistantRateLimitBuckets?: Map<string, number[]>;
};

const buckets =
  globalForAssistant.__assistantRateLimitBuckets ??
  (globalForAssistant.__assistantRateLimitBuckets = new Map<string, number[]>());

export function checkAssistantRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (buckets.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1_000),
    );
    buckets.set(key, recent);
    return {
      allowed: false,
      limit: RATE_LIMIT_MAX,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  recent.push(now);
  buckets.set(key, recent);

  return {
    allowed: true,
    limit: RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - recent.length),
    retryAfterSeconds: 0,
  };
}
