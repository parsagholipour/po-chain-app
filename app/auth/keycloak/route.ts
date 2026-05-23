import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { KEYCLOAK_PROVIDER_ID } from "@/lib/auth-sign-in";

export const runtime = "nodejs";

function callbackUrlFromRequest(request: Request): string {
  const raw = new URL(request.url).searchParams.get("callbackUrl");
  if (!raw) return "/";
  try {
    const parsed = new URL(raw, request.url);
    if (parsed.origin !== new URL(request.url).origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

export async function GET(request: Request) {
  const redirectTo = callbackUrlFromRequest(request);

  try {
    await signIn(KEYCLOAK_PROVIDER_ID, { redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/auth/error?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}
