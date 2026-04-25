import { requireSuperAdmin } from "@/lib/super-admin";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
