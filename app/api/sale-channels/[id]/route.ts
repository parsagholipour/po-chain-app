import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saleChannelUpdateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  requireInternalStoreContext,
  requireStoreContext,
} from "@/lib/store-context";
import { z } from "zod";
import {
  KeycloakAdminConfigError,
  KeycloakAdminError,
  provisionDistributorKeycloakUser,
} from "@/lib/keycloak-admin";
import { createSaleChannelAccountNotification } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const keycloakSubSchema = z.uuid();
const DISTRIBUTOR_LOGIN_EMAIL_DOMAIN = "po-app.local";

function saleChannelResponse<T extends { loginUser?: { id: string } | null }>(
  row: T,
) {
  const { loginUser: _loginUser, ...rest } = row;
  return { ...rest, loginEnabled: Boolean(_loginUser) };
}

async function availableDistributorAppEmail(
  tx: Prisma.TransactionClient,
  input: {
    preferredEmail: string;
    saleChannelId: string;
    keycloakSub: string;
    targetUserId?: string | null;
  },
) {
  const preferredEmail = input.preferredEmail.trim().toLowerCase();
  const preferredOwner = await tx.user.findFirst({
    where: { OR: [{ email: input.preferredEmail }, { email: preferredEmail }] },
    select: { id: true },
  });
  if (!preferredOwner || preferredOwner.id === input.targetUserId) {
    return preferredEmail;
  }

  const aliases = [
    `distributor-${input.saleChannelId}@${DISTRIBUTOR_LOGIN_EMAIL_DOMAIN}`,
    `distributor-${input.saleChannelId}-${input.keycloakSub.slice(0, 8)}@${DISTRIBUTOR_LOGIN_EMAIL_DOMAIN}`,
  ];
  for (const email of aliases) {
    const owner = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!owner || owner.id === input.targetUserId) return email;
  }
  return `${input.keycloakSub}@${DISTRIBUTOR_LOGIN_EMAIL_DOMAIN}`;
}

async function upsertDistributorLoginUser(
  tx: Prisma.TransactionClient,
  input: {
    keycloakSub: string;
    email: string;
    name: string;
    saleChannelId: string;
    storeId: string;
    targetUserId?: string | null;
  },
) {
  const email = input.email.trim().toLowerCase();
  const existingByEmail = await tx.user.findFirst({
    where: { OR: [{ email: input.email }, { email }] },
    select: { id: true, saleChannelId: true, type: true },
  });
  const existingByKeycloakSub = await tx.user.findUnique({
    where: { keycloakSub: input.keycloakSub },
    select: { id: true, type: true, saleChannelId: true },
  });
  const existingTargetUser = input.targetUserId
    ? await tx.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, type: true, saleChannelId: true },
      })
    : null;
  const targetUser =
    existingByKeycloakSub ??
    (existingTargetUser?.type === "distributor" ? existingTargetUser : null) ??
    (existingByEmail?.type === "distributor" ? existingByEmail : null);
  const appEmail = await availableDistributorAppEmail(tx, {
    preferredEmail: email,
    saleChannelId: input.saleChannelId,
    keycloakSub: input.keycloakSub,
    targetUserId: targetUser?.id,
  });

  const userData = {
    keycloakSub: input.keycloakSub,
    email: appEmail,
    name: input.name,
    realEmail: email,
    realName: input.name,
    type: "distributor" as const,
    saleChannelId: input.saleChannelId,
  };
  await tx.user.updateMany({
    where: {
      saleChannelId: input.saleChannelId,
      ...(targetUser ? { id: { not: targetUser.id } } : {}),
    },
    data: { saleChannelId: null },
  });

  const user = targetUser
    ? await tx.user.update({
        where: { id: targetUser.id },
        data: userData,
        select: { id: true },
      })
    : await tx.user.create({
        data: userData,
        select: { id: true },
      });

  await tx.userStore.createMany({
    data: [{ userId: user.id, storeId: input.storeId }],
    skipDuplicates: true,
  });

  return true;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { saleChannelId, storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);
  if (isDistributorContext(authz.context) && saleChannelId !== pid.data.id) {
    return jsonError("Not found", 404);
  }

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
  const { userId, storeId } = authz.context;

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

    if (existing.loginUser && nextType !== existing.type) {
      return jsonError("Remove the sale channel login before changing this sale channel type", 400);
    }
    if (nextType !== "distributor" && loginPassword) {
      return jsonError("Only distributor sale channels can have login passwords", 400);
    }
    if (nextType === "distributor" && (existing.loginUser || loginPassword) && !nextEmail) {
      return jsonError("Email is required for distributor login", 400);
    }

    const shouldProvisionLogin =
      nextType === "distributor" &&
      nextEmail &&
      (existing.loginUser || loginPassword);
    const provisioned = shouldProvisionLogin
        ? await provisionDistributorKeycloakUser({
            email: nextEmail,
            name: nextName,
            password: loginPassword,
            existingUserId: existing.loginUser?.keycloakSub,
          })
        : null;
    const keycloakSub = provisioned ? keycloakSubSchema.safeParse(provisioned.id) : null;
    if (provisioned && !keycloakSub?.success) {
      return jsonError("Keycloak returned a non-UUID user id", 502);
    }

    const result = await prisma.$transaction(async (tx) => {
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
          targetUserId: existing.loginUser?.id,
        });
      }

      const notificationIds =
        keycloakSub?.success && !existing.loginUser
          ? await createSaleChannelAccountNotification(tx, {
              storeId,
              createdById: userId,
              saleChannel: { id: existing.id, name: nextName },
            })
          : [];

      const row = await tx.saleChannel.findUniqueOrThrow({
        where: { id: pid.data.id },
        include: { loginUser: { select: { id: true } } },
      });

      return { row, notificationIds };
    });

    await dispatchNotificationEmailsSafely(result.notificationIds);

    return NextResponse.json(saleChannelResponse(result.row));
  } catch (e) {
    if (e instanceof KeycloakAdminConfigError) {
      return jsonError(e.message, 503);
    }
    if (e instanceof KeycloakAdminError) {
      console.warn("[sale-channels] Keycloak admin error", {
        message: e.message,
        status: e.status,
        details: e.details,
      });
      return jsonError(e.message, 502);
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
    const locationsInUse = await prisma.saleChannelLocation.count({
      where: { saleChannelId: pid.data.id, storeId },
    });
    if (locationsInUse > 0) {
      return jsonError("Sale channel has locations", 409);
    }
    const loginUsers = await prisma.user.count({
      where: { saleChannelId: pid.data.id },
    });
    if (loginUsers > 0) {
      return jsonError("Sale channel has a login user", 409);
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
