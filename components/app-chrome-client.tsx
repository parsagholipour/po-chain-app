"use client";

import { usePathname } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { SuperAdminShell } from "@/components/super-admin-shell";
import { StoreThemeVariables } from "@/components/store-theme-variables";
import { getStoreThemeStyle, type StoreTheme } from "@/lib/store-theme";

type StoreOption = {
  id: string;
  slug: string;
  name: string;
};

export function AppChromeClient({
  authenticated,
  stores,
  activeStoreId,
  activeStoreName,
  hasActiveStore,
  shellTheme,
  children,
}: {
  authenticated: boolean;
  stores: StoreOption[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  hasActiveStore: boolean;
  shellTheme: StoreTheme;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/super-admin")) {
    return (
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <SuperAdminShell>{children}</SuperAdminShell>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-1 flex-col"
      style={hasActiveStore ? getStoreThemeStyle(shellTheme) : undefined}
    >
      <StoreThemeVariables theme={hasActiveStore ? shellTheme : null} />
      <AdminShell
        authenticated={authenticated}
        stores={stores}
        activeStoreId={activeStoreId}
        activeStoreName={activeStoreName}
        logoHueRotateDeg={shellTheme.logoHueRotateDeg}
      >
        {children}
      </AdminShell>
    </div>
  );
}
