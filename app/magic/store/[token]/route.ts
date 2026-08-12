import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import {
  STORE_MAGIC_LINK_PROVIDER_ID,
  storeMagicLinkAuthOrigin,
  storeMagicLinkUrl,
} from "@/lib/sale-channel-magic-links";

export const runtime = "nodejs";

/** Marks a request we already bounced, so a surprising host header cannot loop forever. */
const CANONICAL_PARAM = "canonical";

function normalizedHost(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

/**
 * signIn() writes the session cookie for whichever host served this route, but builds its
 * post-sign-in redirect from AUTH_URL. A link opened on any other host therefore sets the
 * cookie on the host the user is leaving and drops them on the redirect target signed out.
 * Bounce to the auth origin first so the cookie and the redirect share a host - this keeps
 * links that were handed out for an older origin working.
 */
async function canonicalRedirectUrl(request: Request, token: string) {
  const authOrigin = storeMagicLinkAuthOrigin();
  if (!authOrigin) return null;

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has(CANONICAL_PARAM)) return null;

  const headerStore = await headers();
  const authHost = new URL(authOrigin).host;
  const requestHosts = [
    requestUrl.host,
    normalizedHost(headerStore.get("host")),
    normalizedHost(headerStore.get("x-forwarded-host")),
  ];
  if (requestHosts.some((host) => host === authHost)) return null;

  const target = new URL(storeMagicLinkUrl(authOrigin, token));
  target.searchParams.set(CANONICAL_PARAM, "1");
  return target.toString();
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token) {
    redirect("/auth/error?error=Verification");
  }

  const canonical = await canonicalRedirectUrl(request, token);
  if (canonical) {
    redirect(canonical);
  }

  try {
    await signIn(STORE_MAGIC_LINK_PROVIDER_ID, {
      token,
      redirectTo: "/new-order",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/auth/error?error=Verification");
    }
    throw error;
  }
}
