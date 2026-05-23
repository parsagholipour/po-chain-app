import { Prisma } from "@/app/generated/prisma/client";

const CONNECTION_ERROR_CODES = new Set(["P1001", "P1002", "P1017"]);

function messageLooksLikeConnectionFailure(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("can't reach database server") ||
    lower.includes("can't reach database") ||
    lower.includes("connection refused") ||
    lower.includes("econnrefused") ||
    lower.includes("connect econnrefused") ||
    lower.includes("server has closed the connection")
  );
}

/** True when Prisma (or the driver) cannot reach or use the database. */
export function isPrismaUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (CONNECTION_ERROR_CODES.has(error.code)) return true;
    if (messageLooksLikeConnectionFailure(error.message)) return true;
  }
  if (error instanceof Error && messageLooksLikeConnectionFailure(error.message)) {
    return true;
  }
  return false;
}

export type PrismaAvailabilityResult<T> =
  | { ok: true; value: T }
  | { ok: false; unavailable: true };

export async function runIfPrismaAvailable<T>(
  fn: () => Promise<T>,
): Promise<PrismaAvailabilityResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (isPrismaUnavailableError(error)) {
      console.warn(
        "[prisma] database unavailable:",
        error instanceof Error ? error.message : error,
      );
      return { ok: false, unavailable: true };
    }
    throw error;
  }
}
