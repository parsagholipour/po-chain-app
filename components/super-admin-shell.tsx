import Link from "next/link";
import { Package } from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { APP_NAME } from "@/lib/app-name";
import { ModeToggle } from "@/components/mode-toggle";

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Package className="size-4" />
              </span>
              <span className="truncate">{APP_NAME}</span>
            </Link>
            <span className="hidden text-muted-foreground sm:inline">·</span>
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">
              Super admin
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to app
            </Link>
            <ModeToggle />
            <AuthControls />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
