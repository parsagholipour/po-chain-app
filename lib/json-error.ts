import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/app/generated/prisma/client";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export function jsonFromZod(e: ZodError) {
  const first = e.issues[0];
  return NextResponse.json(
    { message: first?.message ?? "Validation error", issues: e.issues },
    { status: 400 },
  );
}

const prismaVerboseErrors =
  process.env.NODE_ENV === "development" || process.env.PRISMA_ERROR_DETAILS === "1";

function logPrismaKnownError(e: Prisma.PrismaClientKnownRequestError) {
  console.error(
    "[Prisma]",
    e.code,
    e.message,
    prismaVerboseErrors ? JSON.stringify(e.meta) : "",
  );
}

export function jsonFromPrisma(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    logPrismaKnownError(e);

    if (e.code === "P2002") {
      return NextResponse.json(
        {
          message: "A record with this value already exists",
          prismaCode: e.code,
          ...(prismaVerboseErrors ? { prismaMeta: e.meta } : {}),
        },
        { status: 409 },
      );
    }
    if (e.code === "P2003" || e.code === "P2014") {
      const meta = e.meta as Record<string, unknown> | undefined;
      const field = typeof meta?.field_name === "string" ? meta.field_name : undefined;
      const hint =
        e.code === "P2003"
          ? "A foreign key constraint failed. Common causes: the signed-in user is not in the database (try signing out and back in), or an ID in the request does not exist."
          : "This change would break a required relation between records.";
      return NextResponse.json(
        {
          message: prismaVerboseErrors ? `${hint} (${e.message})` : hint,
          prismaCode: e.code,
          ...(field ? { field } : {}),
          ...(prismaVerboseErrors ? { prismaMeta: e.meta } : {}),
        },
        { status: 400 },
      );
    }
    if (e.code === "P2025") {
      return NextResponse.json(
        {
          message: "Record not found",
          prismaCode: e.code,
          ...(prismaVerboseErrors ? { prismaMeta: e.meta } : {}),
        },
        { status: 404 },
      );
    }

    console.error("[Prisma] unmapped known error", e.code, e.message);
    return NextResponse.json(
      {
        message: prismaVerboseErrors ? e.message : "Database request failed",
        prismaCode: e.code,
        ...(prismaVerboseErrors ? { prismaMeta: e.meta } : {}),
      },
      { status: 400 },
    );
  }
  return null;
}
