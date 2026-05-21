import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  linkId: z.uuid(),
});

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const result = await prisma.saleChannelMagicLink.updateMany({
      where: {
        id: parsed.data.linkId,
        saleChannelId: parsed.data.id,
        storeId,
        revokedAt: null,
        saleChannel: { type: "store" },
      },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      return jsonError("Magic link not found", 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
