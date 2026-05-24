import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { distributorChangePasswordSchema } from "@/lib/validations/account";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  KeycloakAdminConfigError,
  KeycloakAdminError,
  resetDistributorKeycloakPassword,
} from "@/lib/keycloak-admin";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;

  const context = authz.context;
  if (
    !isDistributorContext(context) ||
    context.saleChannelType !== "distributor" ||
    !context.saleChannelId
  ) {
    return jsonError("Only logged-in distributor accounts can change passwords", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = distributorChangePasswordSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        keycloakSub: true,
        type: true,
        saleChannelId: true,
        saleChannel: { select: { type: true } },
      },
    });

    if (
      !user ||
      user.type !== "distributor" ||
      user.saleChannelId !== context.saleChannelId ||
      user.saleChannel?.type !== "distributor"
    ) {
      return jsonError("Only logged-in distributor accounts can change passwords", 403);
    }

    await resetDistributorKeycloakPassword(
      user.keycloakSub,
      parsed.data.newPassword,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof KeycloakAdminConfigError) {
      return jsonError(e.message, 503);
    }
    if (e instanceof KeycloakAdminError) {
      return jsonError(e.message, 502);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
