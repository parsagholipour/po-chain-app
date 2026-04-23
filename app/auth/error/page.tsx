import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign-in error",
};

/** Auth.js / NextAuth `error` query values and what they usually mean */
const ERROR_GUIDE: Record<string, string> = {
  AccessDenied:
    "Auth.js maps this when sign-in was blocked—common cases: user cancelled or denied consent on Keycloak, a Keycloak authentication/authorization flow error, or the signIn callback returned false.",
  Configuration:
    "Misconfiguration (e.g. invalid Keycloak issuer, client id/secret, or redirect URL). Check server logs and AUTH_KEYCLOAK_* / NEXTAUTH_* / AUTH_URL.",
  Verification:
    "Email/magic-link verification failed: token expired, invalid, or already used.",
  OAuthSignin:
    "Failed to start the OAuth flow with the provider.",
  OAuthCallback:
    "OAuth callback failed (exchange code for tokens, invalid state, or provider error). Check `error_description` below if present.",
  OAuthAccountNotLinked:
    "An account exists with this email using a different sign-in method.",
  Callback:
    "Generic error in the OAuth callback route.",
  Default: "Unspecified authentication error.",
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = firstParam(params.error) ?? "(missing)";
  const oauthDescription = firstParam(params.error_description);

  const guide =
    typeof code === "string" && code !== "(missing)" && ERROR_GUIDE[code]
      ? ERROR_GUIDE[code]
      : ERROR_GUIDE.Default;

  const rows = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Sign-in could not complete</CardTitle>
            <CardDescription>
              Error code from Auth.js / the identity provider (Keycloak).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">Error code</p>
              <p className="font-mono text-base font-medium">{code}</p>
            </div>
            <div>
              <p className="text-muted-foreground">What this usually means</p>
              <p className="leading-relaxed">{guide}</p>
            </div>
            {oauthDescription ? (
              <div>
                <p className="text-muted-foreground">
                  Provider message (OAuth / Keycloak)
                </p>
                <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                  {oauthDescription}
                </p>
              </div>
            ) : null}
            <details className="rounded-md border border-border bg-muted/30 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Full request details (query parameters)
              </summary>
              {rows.length === 0 ? (
                <p className="mt-2 text-muted-foreground">
                  No query parameters were passed to this page.
                </p>
              ) : (
                <dl className="mt-3 space-y-2 font-mono text-xs">
                  {rows.map(([key, raw]) => {
                    const val = Array.isArray(raw) ? raw.join(", ") : raw;
                    return (
                      <div
                        key={key}
                        className="grid gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                      >
                        <dt className="text-muted-foreground">{key}</dt>
                        <dd className="break-all text-foreground">{val}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </details>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to home
            </Link>
            <p className="text-xs text-muted-foreground">
              Retry sign-in from the toolbar on the home page. If this persists,
              confirm Keycloak client redirect URIs and that the database is
              reachable for user sync.
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
