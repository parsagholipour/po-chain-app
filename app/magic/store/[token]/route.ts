import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { STORE_MAGIC_LINK_PROVIDER_ID } from "@/lib/sale-channel-magic-links";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token) {
    redirect("/auth/error?error=Verification");
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
