"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminShell } from "@/components/admin-shell";
import { SuperAdminShell } from "@/components/super-admin-shell";
import { StoreThemeVariables } from "@/components/store-theme-variables";
import { keycloakSignInPath } from "@/lib/auth-sign-in";
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
  activeStoreLogoKey,
  userType,
  saleChannelName,
  saleChannelType,
  hasActiveStore,
  shellTheme,
  children,
}: {
  authenticated: boolean;
  stores: StoreOption[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  activeStoreLogoKey: string | null;
  userType: "internal" | "distributor" | null;
  saleChannelName: string | null;
  saleChannelType: "distributor" | "store" | "amazon" | "cjdropshipping" | null;
  hasActiveStore: boolean;
  shellTheme: StoreTheme;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath =
    pathname.startsWith("/auth/error") ||
    pathname === "/auth/keycloak" ||
    pathname === "/auth/signed-out" ||
    pathname === "/auth/signout" ||
    pathname.startsWith("/magic/store/");
  const isDistributor = userType === "distributor";
  const isStoreSaleChannel = saleChannelType === "store";
  const distributorAllowed =
    pathname === "/" ||
    pathname === "/account" ||
    pathname === "/new-order" ||
    pathname === "/new-order/success" ||
    pathname === "/new-order/cancelled" ||
    pathname === "/products" ||
    pathname === "/purchase-orders" ||
    pathname === "/purchase-orders-overview" ||
    pathname.startsWith("/purchase-orders/") ||
    (!isStoreSaleChannel && pathname === "/sale-channels") ||
    pathname.startsWith("/auth/error");

  useEffect(() => {
    if (isDistributor && !distributorAllowed) {
      router.replace("/");
    }
  }, [distributorAllowed, isDistributor, router]);

  useEffect(() => {
    if (!authenticated && !isPublicPath) {
      router.replace(keycloakSignInPath(window.location.href));
    }
  }, [authenticated, isPublicPath, router]);

  if (!authenticated && !isPublicPath) {
    return (
      <div className="flex min-h-[100dvh] flex-1 items-center justify-center text-sm text-muted-foreground">
        Redirecting...
      </div>
    );
  }

  if (isDistributor && !distributorAllowed) {
    return (
      <div
        className="flex min-h-[100dvh] flex-1 flex-col font-sans"
        style={hasActiveStore ? getStoreThemeStyle(shellTheme) : undefined}
      >
        <StoreThemeVariables theme={hasActiveStore ? shellTheme : null} />
        <AdminShell
          authenticated={authenticated}
          stores={stores}
          activeStoreId={activeStoreId}
          activeStoreName={activeStoreName}
          activeStoreLogoKey={activeStoreLogoKey}
          userType={userType}
          saleChannelName={saleChannelName}
          saleChannelType={saleChannelType}
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
      className="flex min-h-[100dvh] flex-1 flex-col font-sans"
      style={hasActiveStore ? getStoreThemeStyle(shellTheme) : undefined}
    >
      <StoreThemeVariables theme={hasActiveStore ? shellTheme : null} />
      <AdminShell
        authenticated={authenticated}
        stores={stores}
        activeStoreId={activeStoreId}
        activeStoreName={activeStoreName}
        activeStoreLogoKey={activeStoreLogoKey}
        userType={userType}
        saleChannelName={saleChannelName}
        saleChannelType={saleChannelType}
        logoHueRotateDeg={shellTheme.logoHueRotateDeg}
      >
        {children}
      </AdminShell>
    </div>
  );
}
