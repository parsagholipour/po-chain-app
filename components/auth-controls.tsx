"use client";

import { Button } from "@/components/ui/button";
import { KEYCLOAK_PROVIDER_ID } from "@/lib/auth-sign-in";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button>;

export function AuthControls({
  signInClassName,
  signInSize = "sm",
  signInVariant = "secondary",
}: {
  signInClassName?: string;
  signInSize?: ButtonProps["size"];
  signInVariant?: ButtonProps["variant"];
} = {}) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <span className="text-sm text-muted-foreground tabular-nums">…</span>
    );
  }

  if (!session) {
    return (
      <Button
        type="button"
        variant={signInVariant}
        size={signInSize}
        className={signInClassName}
        onClick={() => signIn(KEYCLOAK_PROVIDER_ID)}
      >
        Sign in
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href="/account"
        className="min-w-0 truncate text-sm text-muted-foreground hover:text-foreground"
      >
        Account
      </Link>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
