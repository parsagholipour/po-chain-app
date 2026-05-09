import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  type AppUserType = "internal" | "distributor";

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      type: AppUserType;
      saleChannelId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  type AppUserType = "internal" | "distributor";

  interface JWT {
    appUserId?: string;
    userType?: AppUserType;
    saleChannelId?: string | null;
    realEmail?: string | null;
    realName?: string | null;
  }
}
