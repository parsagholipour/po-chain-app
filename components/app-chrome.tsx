import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { SuperAdminShell } from "@/components/super-admin-shell";
import { StoreThemeVariables } from "@/components/store-theme-variables";
import { getStoreThemeStyle } from "@/lib/store-theme";
import { getStoreContextForUserId } from "@/lib/store-context";

export async function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (pathname.startsWith("/super-admin")) {
    return (
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <SuperAdminShell>{children}</SuperAdminShell>
      </div>
    );
  }

  const session = await auth();
  const storeContext = session?.user?.id
    ? await getStoreContextForUserId(session.user.id)
    : null;
  const activeStore = storeContext?.activeStore ?? null;

  return (
    <div
      className="flex min-h-[100dvh] flex-1 flex-col"
      style={activeStore ? getStoreThemeStyle(activeStore.theme) : undefined}
    >
      <StoreThemeVariables theme={activeStore?.theme ?? null} />
      <AdminShell
        authenticated={Boolean(session?.user)}
        stores={storeContext?.stores ?? []}
        activeStoreId={activeStore?.id ?? null}
        activeStoreName={activeStore?.name ?? null}
      >
        {children}
      </AdminShell>
    </div>
  );
}
