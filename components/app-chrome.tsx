import { auth } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";

export async function AppChrome({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col">
      <AdminShell authenticated={Boolean(session?.user)}>
        {children}
      </AdminShell>
    </div>
  );
}
