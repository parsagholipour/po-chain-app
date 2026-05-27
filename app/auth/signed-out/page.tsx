import Link from "next/link";

import { keycloakSignInPath } from "@/lib/auth-sign-in";

export default function SignedOutPage() {
  return (
    <main className="mx-auto flex min-h-[55vh] w-full max-w-md flex-col justify-center gap-5 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Signed out</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Your app session has been closed.
        </p>
      </div>
      <Link
        className="inline-flex h-8 w-fit shrink-0 items-center justify-center rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all outline-none hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        href={keycloakSignInPath("/")}
      >
        Sign in again
      </Link>
    </main>
  );
}
