"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Boxes,
  BrainCircuit,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  BarChart3,
  Factory,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Radio,
  Settings,
  Truck,
  Warehouse,
} from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { AssistantSheet } from "@/components/assistant/assistant-sheet";
import { APP_NAME } from "@/lib/app-name";
import { ModeToggle } from "@/components/mode-toggle";
import { StoreSwitcher } from "@/components/store-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useNavCounts } from "@/lib/use-nav-counts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearchBar } from "@/components/global-search-bar";

type NavIcon = (typeof Boxes);
type NavChild = {
  href: string;
  label: string;
};

type NavLink = {
  kind: "link";
  href: string;
  label: string;
  icon: NavIcon;
};

type NavGroup = {
  kind: "group";
  href: string;
  label: string;
  icon: NavIcon;
  children: readonly NavChild[];
};

type NavItem = NavLink | NavGroup;

const nav: readonly NavItem[] = [
  { kind: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    kind: "group",
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    children: [
      { href: "/analytics/revenue", label: "Sales & profit" },
      { href: "/analytics/products", label: "Products" },
      { href: "/analytics/sale-channels", label: "Sale channels" },
      { href: "/analytics/manufacturers", label: "Manufacturers" },
      { href: "/analytics/manufacturing", label: "Manufacturing" },
      { href: "/analytics/stock-orders", label: "Stock orders" },
      { href: "/analytics/shipping", label: "Shipping" },
      { href: "/analytics/data-quality", label: "Data quality" },
    ],
  },
  {
    kind: "link",
    href: "/purchase-orders-overview",
    label: "Purchase orders",
    icon: ClipboardList,
  },
  {
    kind: "link",
    href: "/stock-orders",
    label: "Stock orders",
    icon: Warehouse,
  },
  { kind: "link", href: "/manufacturing-orders", label: "Manufacturing orders", icon: FileText },
  { kind: "link", href: "/manufacturers", label: "Manufacturers", icon: Factory },
  {
    kind: "group",
    href: "/products",
    label: "Products",
    icon: Boxes,
    children: [{ href: "/product-categories", label: "Product Categories" }],
  },
  { kind: "link", href: "/sale-channels", label: "Sale channels", icon: Radio },
  { kind: "link", href: "/logistics-partners", label: "Logistics Partners", icon: Truck },
  { kind: "link", href: "/shipping", label: "Shipping", icon: Package },
  { kind: "link", href: "/settings", label: "Settings", icon: Settings },
] as const;

type StoreOption = {
  id: string;
  slug: string;
  name: string;
};

function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navGroupActive(pathname: string, item: NavGroup) {
  return navActive(pathname, item.href) || item.children.some((child) => navActive(pathname, child.href));
}

function SidebarBrand({ activeStoreName, isCollapsed }: { activeStoreName: string | null; isCollapsed?: boolean }) {
  return (
    <div className={cn("flex h-16 items-center border-b border-sidebar-border", isCollapsed ? "justify-center px-0" : "gap-2 px-5")}>
      <div className="relative size-10 shrink-0 overflow-hidden">
        <Image
          src="/logo.png"
          alt={isCollapsed ? APP_NAME : ""}
          width={60}
          height={60}
          className="size-10 object-cover h-full w-auto"
          priority
        />
      </div>
      {!isCollapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold tracking-tight text-sidebar-foreground">
            {APP_NAME}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {activeStoreName ?? "Operations"}
          </p>
        </div>
      )}
    </div>
  );
}

function NavCountBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-[10px] font-semibold tabular-nums text-sidebar-primary">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavList({
  onNavigate,
  className,
  isCollapsed,
}: {
  onNavigate?: () => void;
  className?: string;
  isCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const { data: navCounts } = useNavCounts();

  const countByHref: Record<string, number | undefined> = {
    "/purchase-orders-overview": navCounts?.purchaseOrders,
    "/stock-orders": navCounts?.stockOrders,
    "/manufacturing-orders": navCounts?.manufacturingOrders,
  };

  return (
    <nav className={cn("flex flex-col gap-0.5 p-3", className)}>
      {!isCollapsed && (
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
      )}
      {nav.map((item) => {
        if (item.kind === "link") {
          const active = navActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
                isCollapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              {active && !isCollapsed ? (
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
              {!isCollapsed && <span className="relative truncate">{item.label}</span>}
              {!isCollapsed && <NavCountBadge count={countByHref[item.href]} />}
            </Link>
          );
        }

        const groupActive = navGroupActive(pathname, item);
        const parentActive = navActive(pathname, item.href);

        if (isCollapsed) {
          return (
            <DropdownMenu key={item.href}>
              <DropdownMenuTrigger
                title={item.label}
                className={cn(
                  "group relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors",
                  groupActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "relative size-[18px] shrink-0 transition-colors",
                    groupActive ? "text-sidebar-primary" : "opacity-80 group-hover:opacity-100",
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" sideOffset={8} className="w-56">
                <DropdownMenuItem
                  render={
                    <Link href={item.href} onClick={onNavigate}>
                      {item.label}
                    </Link>
                  }
                />
                {item.children.map((child) => (
                  <DropdownMenuItem
                    key={child.href}
                    render={
                      <Link href={child.href} onClick={onNavigate}>
                        {child.label}
                      </Link>
                    }
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <div key={item.href} className="space-y-0.5">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                parentActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              {parentActive ? (
                <span
                  className="absolute inset-y-1 left-0 w-1 rounded-full bg-sidebar-primary"
                  aria-hidden
                />
              ) : null}
              <item.icon
                className={cn(
                  "relative size-[18px] shrink-0 transition-colors",
                  groupActive ? "text-sidebar-primary" : "opacity-80 group-hover:opacity-100",
                )}
              />
              <span className="relative truncate">{item.label}</span>
            </Link>
            {groupActive ? (
              <div className="ml-6 border-l border-sidebar-border/70 pl-2">
                {item.children.map((child) => {
                  const childActive = navActive(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                        childActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {childActive ? (
                        <span
                          className="absolute inset-y-1 left-0 w-1 rounded-full bg-sidebar-primary"
                          aria-hidden
                        />
                      ) : null}
                      <span className="truncate">{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  stores,
  activeStoreId,
  isCollapsed,
}: {
  stores: StoreOption[];
  activeStoreId: string | null;
  isCollapsed?: boolean;
}) {
  return (
    <div className={cn("mt-auto border-t border-sidebar-border bg-sidebar/80 p-4 backdrop-blur-sm", isCollapsed ? "flex flex-col items-center gap-4" : "space-y-3")}>
      {activeStoreId ? (
        <StoreSwitcher stores={stores} activeStoreId={activeStoreId} isCollapsed={isCollapsed} />
      ) : (
        <div className={cn("rounded-lg border border-dashed border-sidebar-border/80 bg-sidebar-accent/30 text-sm text-muted-foreground", isCollapsed ? "p-2" : "p-3")}>
          <div className="flex items-center justify-center gap-2">
            <Building2 className="size-4" />
            {!isCollapsed && "No store assigned"}
          </div>
        </div>
      )}
      <div className={cn("flex flex-wrap items-center gap-2", isCollapsed ? "justify-center" : "")}>
        <ModeToggle />
        {!isCollapsed && (
          <div className="min-w-0 flex-1 [&_a]:truncate">
            <AuthControls />
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminShell({
  authenticated,
  stores,
  activeStoreId,
  activeStoreName,
  children,
}: {
  authenticated: boolean;
  stores: StoreOption[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar:collapsed") === "true";
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar:collapsed", String(next));
      return next;
    });
  };

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
              {APP_NAME}
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
      <aside className={cn("relative z-20 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_32px_-12px_rgba(0,0,0,0.45)] md:sticky md:top-0 md:flex transition-all duration-300", isCollapsed ? "w-[68px]" : "w-[272px]")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-sidebar-primary/8 to-transparent" />
        <button
          onClick={toggleCollapse}
          className="absolute -right-3.5 top-6 z-30 flex size-7 items-center justify-center rounded-full border border-sidebar-border bg-background shadow-sm hover:bg-muted"
        >
          {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={cn("flex min-h-0 flex-1 flex-col", isCollapsed ? "w-[68px]" : "w-[272px]")}>
            <SidebarBrand activeStoreName={activeStoreName} isCollapsed={isCollapsed} />
            <ScrollArea className="min-h-0 flex-1">
              <NavList isCollapsed={isCollapsed} />
            </ScrollArea>
            <SidebarFooter stores={stores} activeStoreId={activeStoreId} isCollapsed={isCollapsed} />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30 dark:bg-background">
        <AssistantSheet
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          activeStoreId={activeStoreId}
          activeStoreName={activeStoreName}
        />

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
              <span className="truncate">{APP_NAME}</span>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen(true)}
              disabled={!activeStoreId}
            >
              <BrainCircuit className="size-3.5" />
              AI
            </Button>
            <ModeToggle />
            <div className="shrink-0">
              <AuthControls />
            </div>
          </header>

          <SheetContent
            side="left"
            className="flex w-[min(100%,288px)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetHeader className="border-b border-sidebar-border px-4 py-3 text-left">
              <SheetTitle className="font-heading text-base">Navigation</SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <NavList
                onNavigate={() => setMobileNavOpen(false)}
                className="pb-6"
              />
            </ScrollArea>
            <SidebarFooter stores={stores} activeStoreId={activeStoreId} />
          </SheetContent>
        </Sheet>

        <header className="sticky top-0 z-10 hidden shrink-0 border-b border-border/70 bg-background/90 backdrop-blur-md md:block">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="min-w-0 flex-1">
              <Suspense fallback={null}>
                <GlobalSearchBar />
              </Suspense>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen(true)}
              disabled={!activeStoreId}
            >
              <BrainCircuit className="size-3.5" />
              AI
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
