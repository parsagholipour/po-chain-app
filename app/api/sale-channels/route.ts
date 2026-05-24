import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saleChannelCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  requireInternalStoreContext,
  requireStoreContext,
} from "@/lib/store-context";
import {
  KeycloakAdminConfigError,
  KeycloakAdminError,
  provisionDistributorKeycloakUser,
} from "@/lib/keycloak-admin";

export const runtime = "nodejs";

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
  const targetUser =
    existingByKeycloakSub ??
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

export async function GET() {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { saleChannelId, storeId } = authz.context;
  const distributorSaleChannelId = isDistributorContext(authz.context)
    ? saleChannelId
    : null;
  if (isDistributorContext(authz.context) && !distributorSaleChannelId) {
    return NextResponse.json([]);
  }

  const where: Prisma.SaleChannelWhereInput = { storeId };
  if (distributorSaleChannelId) {
    where.id = distributorSaleChannelId;
  }

  const rows = await prisma.saleChannel.findMany({
    where,
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
    const distributorEmail = saleChannelData.email;
    const shouldProvisionLogin =
      saleChannelData.type === "distributor" &&
      typeof distributorEmail === "string";
    const provisioned = shouldProvisionLogin
        ? await provisionDistributorKeycloakUser({
            email: distributorEmail,
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
