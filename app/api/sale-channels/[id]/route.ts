import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saleChannelUpdateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { z } from "zod";
import {
  KeycloakAdminConfigError,
  KeycloakAdminError,
  provisionDistributorKeycloakUser,
} from "@/lib/keycloak-admin";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
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

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.saleChannel.findFirst({
    where: { id: pid.data.id, storeId },
    include: { loginUser: { select: { id: true } } },
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(saleChannelResponse(row));
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saleChannelUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const { loginPassword, ...saleChannelData } = parsed.data;
  if (saleChannelData.type !== undefined && saleChannelData.type !== "distributor" && loginPassword) {
    return jsonError("Only distributor sale channels can have login passwords", 400);
  }

  try {
    const existing = await prisma.saleChannel.findFirst({
      where: { id: pid.data.id, storeId },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        loginUser: { select: { id: true, keycloakSub: true } },
      },
    });
    if (!existing) return jsonError("Not found", 404);

    const nextType = saleChannelData.type ?? existing.type;
    const nextEmail =
      saleChannelData.email !== undefined ? saleChannelData.email : existing.email;
    const nextName = saleChannelData.name ?? existing.name;

    if (nextType !== "distributor" && existing.loginUser) {
      return jsonError("Remove the distributor login before changing this sale channel type", 400);
    }
    if (nextType !== "distributor" && loginPassword) {
      return jsonError("Only distributor sale channels can have login passwords", 400);
    }
    if (nextType === "distributor" && (existing.loginUser || loginPassword) && !nextEmail) {
      return jsonError("Email is required for distributor login", 400);
    }

    const provisioned =
      nextType === "distributor" && nextEmail && (existing.loginUser || loginPassword)
        ? await provisionDistributorKeycloakUser({
            email: nextEmail,
            name: nextName,
            password: loginPassword,
          })
        : null;
    const keycloakSub = provisioned ? keycloakSubSchema.safeParse(provisioned.id) : null;
    if (provisioned && !keycloakSub?.success) {
      return jsonError("Keycloak returned a non-UUID user id", 502);
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.saleChannel.update({
        where: { id: pid.data.id },
        data: saleChannelData,
      });

      if (keycloakSub?.success && nextEmail) {
        await upsertDistributorLoginUser(tx, {
          keycloakSub: keycloakSub.data,
          email: nextEmail.toLowerCase(),
          name: nextName,
          saleChannelId: pid.data.id,
          storeId,
        });
      }

      return tx.saleChannel.findUniqueOrThrow({
        where: { id: pid.data.id },
        include: { loginUser: { select: { id: true } } },
      });
    });
    return NextResponse.json(saleChannelResponse(row));
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

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const warehousesInUse = await prisma.warehouse.count({
      where: { saleChannelId: pid.data.id, storeId },
    });
    if (warehousesInUse > 0) {
      return jsonError("Sale channel is used by warehouses", 409);
    }
    const loginUsers = await prisma.user.count({
      where: { saleChannelId: pid.data.id },
    });
    if (loginUsers > 0) {
      return jsonError("Sale channel has a distributor login user", 409);
    }

    const deleted = await prisma.saleChannel.deleteMany({
      where: { id: pid.data.id, storeId },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
