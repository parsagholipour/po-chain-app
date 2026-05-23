import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  type AppUserType = "internal" | "distributor";
  type AppSaleChannelType = "distributor" | "store" | "amazon" | "cjdropshipping";

  interface Session {
    /** Set when the app database is unreachable or the account cannot be synced. */
    forceSignOut?: boolean;
    user: DefaultSession["user"] & {
      id: string;
      type: AppUserType;
      saleChannelId?: string | null;
      saleChannelType?: AppSaleChannelType | null;
    };
  }

  interface User {
    type?: AppUserType;
    saleChannelId?: string | null;
    saleChannelType?: AppSaleChannelType | null;
  }
}

declare module "next-auth/jwt" {
  type AppUserType = "internal" | "distributor";
  type AppSaleChannelType = "distributor" | "store" | "amazon" | "cjdropshipping";

  interface JWT {
    appUserId?: string;
    userType?: AppUserType;
    saleChannelId?: string | null;
    saleChannelType?: AppSaleChannelType | null;
    authProvider?: "keycloak" | "store-magic-link";
    realEmail?: string | null;
    realName?: string | null;
    /** Clears app session on next request; middleware redirects to sign-out. */
    forceSignOut?: boolean;
  }
}
