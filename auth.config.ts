import type { NextAuthConfig } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

export default {
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    }),
  ],
  trustHost: true,
  pages: {
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request }) {
      if (
        request.nextUrl.pathname === "/" ||
        request.nextUrl.pathname.startsWith("/auth/error") ||
        request.nextUrl.pathname.startsWith("/magic/store/")
      ) {
        return true;
      }
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
