import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default async function AccountPage() {
  const session = await auth();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Session from Keycloak; app user id comes from Prisma after
              upsert-on-login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-medium">{session?.user?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{session?.user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">App user id (Prisma)</p>
              <p className="font-mono text-xs">{session?.user?.id ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}