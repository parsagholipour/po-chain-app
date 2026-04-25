import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";
import { isSuperAdminEmail } from "./lib/super-admin-constants";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/super-admin") && req.auth?.user?.email) {
    if (!isSuperAdminEmail(req.auth.user.email)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: [
    // Exclude static assets in /public (and optimizer) so requests like /logo.png are not
    // intercepted by auth (HTML response breaks next/image and <img src="/...">).
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
