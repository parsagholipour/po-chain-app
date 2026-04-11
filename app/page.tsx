import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Package,
  Factory,
  Radio,
  Boxes,
  FileText,
  ClipboardList,
  Warehouse,
} from "lucide-react";

const links = [
  {
    href: "/purchase-orders-overview",
    title: "Purchase orders",
    description: "Distributor orders by channel and logistics status.",
    icon: ClipboardList,
  },
  {
    href: "/stock-orders",
    title: "Stock orders",
    description: "Internal replenishment orders (same data model as POs, separate UI).",
    icon: Warehouse,
  }, 
  {
    href: "/manufacturing-orders",
    title: "Manufacturing orders",
    description: "Factories, invoices, shipments, and PO line allocations.",
    icon: FileText,
  },
  {
    href: "/manufacturers",
    title: "Manufacturers",
    description: "Suppliers and regions.",
    icon: Factory,
  },
  {
    href: "/sale-channels",
    title: "Sale channels",
    description: "Distributor, Amazon, CJ Dropshipping.",
    icon: Radio,
  },
  {
    href: "/products",
    title: "Products",
    description: "SKUs and default manufacturers.",
    icon: Boxes,
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Package className="size-8 text-primary" />
          Operations
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Manage manufacturing orders, distributor POs, stock orders, channels, products, and suppliers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="block transition-opacity hover:opacity-90">
            <Card className="h-full border-border/80 bg-card/40 hover:bg-card/60">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 size-5 text-primary" />
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
