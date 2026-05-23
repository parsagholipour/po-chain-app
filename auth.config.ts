import type { NextAuthConfig } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { NextResponse } from "next/server";

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
    session({ session, token }) {
      if (token.forceSignOut) {
        session.forceSignOut = true;
      }
      return session;
    },
    authorized({ auth, request }) {
      if (auth?.forceSignOut) {
        const signOutUrl = new URL("/api/auth/signout", request.nextUrl.origin);
        signOutUrl.searchParams.set("callbackUrl", new URL("/", request.nextUrl.origin).toString());
        return NextResponse.redirect(signOutUrl);
      }
      if (
        request.nextUrl.pathname.startsWith("/auth/error") ||
        request.nextUrl.pathname === "/auth/keycloak" ||
        request.nextUrl.pathname.startsWith("/magic/store/")
      ) {
        return true;
      }
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
