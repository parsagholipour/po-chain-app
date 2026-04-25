import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin-constants";

/** Ensures the current session maps to the super-admin Prisma user. */
export async function requireSuperAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/super-admin")}`,
    );
  }

  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });

  if (!row || !isSuperAdminEmail(row.email)) {
    redirect("/");
  }

  return { userId: session.user.id };
}

export { SUPER_ADMIN_EMAIL, isSuperAdminEmail, normalizeEmail } from "@/lib/super-admin-constants";
