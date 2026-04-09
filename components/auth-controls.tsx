"use client";

import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function AuthControls() {
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
        variant="secondary"
        size="sm"
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