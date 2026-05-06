"use client";

import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";
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
        onClick={() => signIn("keycloak")}
      >
        Sign in
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/account"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Account
      </Link>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/" })}
      >
        Sign out
      </Button>
    </div>
  );
}
