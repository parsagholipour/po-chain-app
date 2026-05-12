"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

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
  userType,
  hasActiveStore,
  shellTheme,
  children,
}: {
  authenticated: boolean;
  stores: StoreOption[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  userType: "internal" | "distributor" | null;
  hasActiveStore: boolean;
  shellTheme: StoreTheme;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isDistributor = userType === "distributor";
  const distributorAllowed =
    pathname === "/" ||
    pathname === "/account" ||
    pathname === "/products" ||
    pathname === "/purchase-orders" ||
    pathname === "/purchase-orders-overview" ||
    pathname.startsWith("/purchase-orders/") ||
    pathname === "/sale-channels" ||
    pathname === "/shipping" ||
    pathname.startsWith("/auth/error");

  useEffect(() => {
    if (isDistributor && !distributorAllowed) {
      router.replace("/");
    }
  }, [distributorAllowed, isDistributor, router]);

  if (isDistributor && !distributorAllowed) {
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
          userType={userType}
          logoHueRotateDeg={shellTheme.logoHueRotateDeg}
        >
          <div className="text-sm text-muted-foreground">Redirecting...</div>
        </AdminShell>
      </div>
    );
  }

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
        userType={userType}
        logoHueRotateDeg={shellTheme.logoHueRotateDeg}
      >
        {children}
      </AdminShell>
    </div>
  );
}
