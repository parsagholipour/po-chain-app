import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";
import { isSuperAdminEmail } from "./lib/super-admin-constants";

const { auth } = NextAuth(authConfig);

const publicRoutes = new Set(["/", "/auth/error"]);

function isPublicRoute(pathname: string) {
  return publicRoutes.has(pathname) || pathname.startsWith("/magic/store/");
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  if (!req.auth?.user && !isPublicRoute(pathname)) {
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
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
