"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { STORE_CACHE_TAG } from "@/lib/store";
import { requireSuperAdmin } from "@/lib/super-admin";
import { normalizeStoreTheme, type StoreTheme } from "@/lib/store-theme";
import { superAdminStoreUpdateSchema } from "@/lib/validations/store";

const storeIdSchema = z.uuid();

export type SuperAdminStoreUpdate = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  website: string | null;
  theme: StoreTheme;
};

export type UpdateSuperAdminStoreResult =
  | { ok: true; store: SuperAdminStoreUpdate }
  | { ok: false; message: string };

export async function updateSuperAdminStore(
  storeId: string,
  values: unknown,
): Promise<UpdateSuperAdminStoreResult> {
  await requireSuperAdmin();

  const id = storeIdSchema.safeParse(storeId);
  if (!id.success) {
    return { ok: false, message: "Invalid store id" };
  }

  const parsed = superAdminStoreUpdateSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Validation error" };
  }

  try {
    const row = await prisma.store.update({
      where: { id: id.data },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        email: parsed.data.email ?? null,
        website: parsed.data.website ?? null,
        theme: parsed.data.theme,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        website: true,
        theme: true,
      },
    });

    updateTag(STORE_CACHE_TAG);
    revalidatePath("/super-admin");

    return { ok: true, store: { ...row, theme: normalizeStoreTheme(row.theme) } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return { ok: false, message: "A store with this slug already exists" };
      }
      if (error.code === "P2025") {
        return { ok: false, message: "Store not found" };
      }
    }

    throw error;
  }
}
