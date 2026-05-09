import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saleChannelCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import {
  KeycloakAdminConfigError,
  KeycloakAdminError,
  provisionDistributorKeycloakUser,
} from "@/lib/keycloak-admin";

export const runtime = "nodejs";

const keycloakSubSchema = z.uuid();

function saleChannelResponse<T extends { loginUser?: { id: string } | null }>(
  row: T,
) {
  const { loginUser: _loginUser, ...rest } = row;
  return { ...rest, loginEnabled: Boolean(_loginUser) };
}

async function upsertDistributorLoginUser(
  tx: Prisma.TransactionClient,
  input: {
    keycloakSub: string;
    email: string;
    name: string;
    saleChannelId: string;
    storeId: string;
  },
) {
  const existingByEmail = await tx.user.findUnique({
    where: { email: input.email },
    select: { keycloakSub: true, saleChannelId: true, type: true },
  });
  if (
    existingByEmail &&
    (existingByEmail.keycloakSub !== input.keycloakSub ||
      existingByEmail.type !== "distributor" ||
      (existingByEmail.saleChannelId && existingByEmail.saleChannelId !== input.saleChannelId))
  ) {
    throw new Error("USER_EMAIL_EXISTS");
  }

  const existingByKeycloakSub = await tx.user.findUnique({
    where: { keycloakSub: input.keycloakSub },
    select: { type: true, saleChannelId: true },
  });
  if (
    existingByKeycloakSub &&
    (existingByKeycloakSub.type !== "distributor" ||
      (existingByKeycloakSub.saleChannelId &&
        existingByKeycloakSub.saleChannelId !== input.saleChannelId))
  ) {
    throw new Error("USER_EMAIL_EXISTS");
  }

  const user = await tx.user.upsert({
    where: { keycloakSub: input.keycloakSub },
    create: {
      keycloakSub: input.keycloakSub,
      email: input.email,
      name: input.name,
      realEmail: input.email,
      realName: input.name,
      type: "distributor",
      saleChannelId: input.saleChannelId,
    },
    update: {
      email: input.email,
      name: input.name,
      realEmail: input.email,
      realName: input.name,
      type: "distributor",
      saleChannelId: input.saleChannelId,
    },
    select: { id: true },
  });

  await tx.userStore.createMany({
    data: [{ userId: user.id, storeId: input.storeId }],
    skipDuplicates: true,
  });
}

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.saleChannel.findMany({
    where: { storeId },
    include: { loginUser: { select: { id: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows.map(saleChannelResponse));
}

export async function POST(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saleChannelCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { loginPassword, ...saleChannelData } = parsed.data;
  if (saleChannelData.type !== "distributor" && loginPassword) {
    return jsonError("Only distributor sale channels can have login passwords", 400);
  }
  if (saleChannelData.type === "distributor" && !saleChannelData.email) {
    return jsonError("Email is required for distributor login", 400);
  }
  if (saleChannelData.type === "distributor" && !loginPassword) {
    return jsonError("Password is required for distributor login", 400);
  }

  try {
    const provisioned =
      saleChannelData.type === "distributor" && saleChannelData.email
        ? await provisionDistributorKeycloakUser({
            email: saleChannelData.email,
            name: saleChannelData.name,
            password: loginPassword,
          })
        : null;
    const keycloakSub = provisioned ? keycloakSubSchema.safeParse(provisioned.id) : null;
    if (provisioned && !keycloakSub?.success) {
      return jsonError("Keycloak returned a non-UUID user id", 502);
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.saleChannel.create({
        data: {
          name: saleChannelData.name,
          logoKey: saleChannelData.logoKey ?? null,
          type: saleChannelData.type,
          contactNumber: saleChannelData.contactNumber ?? null,
          address: saleChannelData.address ?? null,
          email: saleChannelData.email ?? null,
          link: saleChannelData.link ?? null,
          notes: saleChannelData.notes ?? null,
          storeId,
          createdById: userId,
        },
      });

      if (keycloakSub?.success && saleChannelData.email) {
        await upsertDistributorLoginUser(tx, {
          keycloakSub: keycloakSub.data,
          email: saleChannelData.email.toLowerCase(),
          name: saleChannelData.name,
          saleChannelId: created.id,
          storeId,
        });
      }

      return tx.saleChannel.findUniqueOrThrow({
        where: { id: created.id },
        include: { loginUser: { select: { id: true } } },
      });
    });

    return NextResponse.json(saleChannelResponse(row), { status: 201 });
  } catch (e) {
    if (e instanceof KeycloakAdminConfigError) {
      return jsonError(e.message, 503);
    }
    if (e instanceof KeycloakAdminError) {
      return jsonError(e.message, 502);
    }
    if (e instanceof Error && e.message === "USER_EMAIL_EXISTS") {
      return jsonError("A user with this email already exists", 409);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
