"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Radio,
  Warehouse,
} from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/manufacturing-orders", label: "Manufacturing orders", icon: FileText },
  {
    href: "/purchase-orders-overview",
    label: "Purchase orders",
    icon: ClipboardList,
  },
  {
    href: "/stock-orders",
    label: "Stock orders",
    icon: Warehouse,
  },
  { href: "/manufacturers", label: "Manufacturers", icon: Factory },
  { href: "/sale-channels", label: "Sale channels", icon: Radio },
  { href: "/products", label: "Products", icon: Boxes },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
      <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-sidebar-primary to-primary shadow-sm ring-1 ring-sidebar-primary/20">
        <Package className="size-[22px] text-sidebar-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-semibold tracking-tight text-sidebar-foreground">
          PO App
        </p>
        <p className="truncate text-xs text-muted-foreground">Operations</p>
      </div>
    </div>
  );
}

function NavList({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-0.5 p-3", className)}>
      <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Menu
      </p>
      {nav.map((item) => {
        const active = navActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            {active ? (
              <span
                className="absolute inset-y-1 left-0 w-1 rounded-full bg-sidebar-primary"
                aria-hidden
              />
            ) : null}
            <item.icon
              className={cn(
                "relative size-[18px] shrink-0 transition-colors",
                active ? "text-sidebar-primary" : "opacity-80 group-hover:opacity-100",
              )}
            />
            <span className="relative truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-auto space-y-3 border-t border-sidebar-border bg-sidebar/80 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ModeToggle />
        <div className="min-w-0 flex-1 [&_a]:truncate">
          <AuthControls />
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  authenticated,
  children,
}: {
  authenticated: boolean;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!authenticated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border/80 bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Package className="size-4" />
              </span>
              PO App
            </Link>
            <div className="flex items-center gap-2">
              <AuthControls />
              <ModeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1">
      {/* Desktop sidebar — sticky so it stays in view when the page scrolls */}
      <aside className="relative z-20 hidden h-[100dvh] max-h-[100dvh] w-[272px] shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_32px_-12px_rgba(0,0,0,0.45)] md:sticky md:top-0 md:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-sidebar-primary/8 to-transparent" />
        <SidebarBrand />
        <ScrollArea className="min-h-0 flex-1">
          <NavList />
        </ScrollArea>
        <SidebarFooter />
      </aside>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30 dark:bg-background">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md md:hidden">
            <SheetTrigger
              type="button"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "shrink-0",
              )}
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <Link
              href="/"
              className="flex min-w-0 flex-1 items-center gap-2 font-semibold tracking-tight"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Package className="size-4" />
              </span>
              <span className="truncate">PO App</span>
            </Link>
            <ModeToggle />
            <div className="shrink-0">
              <AuthControls />
            </div>
          </header>

          <SheetContent
            side="left"
            className="w-[min(100%,288px)] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetHeader className="border-b border-sidebar-border px-4 py-3 text-left">
              <SheetTitle className="font-heading text-base">Navigation</SheetTitle>
            </SheetHeader>
            <ScrollArea className="max-h-[calc(100dvh-5rem)]">
              <NavList
                onNavigate={() => setMobileNavOpen(false)}
                className="pb-6"
              />
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
