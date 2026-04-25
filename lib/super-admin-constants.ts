export const SUPER_ADMIN_EMAIL = "12parsa@gmail.com";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === normalizeEmail(SUPER_ADMIN_EMAIL);
}
