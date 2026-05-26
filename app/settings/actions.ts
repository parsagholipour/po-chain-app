"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { STORE_CACHE_TAG } from "@/lib/store";
import { requireInternalStoreContext } from "@/lib/store-context";
import { normalizeStoreTheme, type StoreTheme } from "@/lib/store-theme";
import { storeThemeSchema } from "@/lib/validations/store";

const storeSettingsSchema = z.object({
  logoKey: z
    .string()
    .trim()
    .max(1200, "Logo reference is too long")
    .nullable(),
  theme: storeThemeSchema.optional(),
});

export type StoreSettingsUpdate = {
  id: string;
  name: string;
  logoKey: string | null;
  theme: StoreTheme;
};

export type UpdateStoreSettingsResult =
  | { ok: true; store: StoreSettingsUpdate }
  | { ok: false; message: string };

export async function updateStoreSettings(
  values: unknown,
): Promise<UpdateStoreSettingsResult> {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) {
    return { ok: false, message: "You do not have access to update store settings" };
  }

  const parsed = storeSettingsSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Validation error" };
  }

  try {
    const store = await prisma.store.update({
      where: { id: authz.context.storeId },
      data: {
        logoKey: parsed.data.logoKey || null,
        ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
      },
      select: {
        id: true,
        name: true,
        logoKey: true,
        theme: true,
      },
    });

    updateTag(STORE_CACHE_TAG);
    revalidatePath("/settings");

    return { ok: true, store: { ...store, theme: normalizeStoreTheme(store.theme) } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { ok: false, message: "Store not found" };
    }

    throw error;
  }
}
