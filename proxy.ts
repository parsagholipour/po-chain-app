import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";
import { keycloakSignInPath } from "./lib/auth-sign-in";
import { isSuperAdminEmail } from "./lib/super-admin-constants";

const { auth } = NextAuth(authConfig);

function isPublicRoute(pathname: string) {
  return (
    pathname === "/auth/error" ||
    pathname === "/auth/keycloak" ||
    pathname.startsWith("/magic/store/")
  );
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  if (!req.auth?.user && !isPublicRoute(pathname)) {
    const signInUrl = new URL(keycloakSignInPath(req.nextUrl.href), req.url);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith("/super-admin") && req.auth?.user?.email) {
    if (!isSuperAdminEmail(req.auth.user.email)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Exclude static assets in /public (and optimizer) so requests like /logo.png are not
    // intercepted by auth (HTML response breaks next/image and <img src="/...">).
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
