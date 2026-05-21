import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Payment Cancelled",
};

export default function NewOrderCancelledPage() {
  return (
    <Card className="mx-auto max-w-lg border-border/80 text-center">
      <CardHeader>
        <CardTitle>Payment cancelled</CardTitle>
        <CardDescription>
          Your payment was not completed, so no purchase orders were created.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-center gap-2">
        <Link href="/new-order" className={buttonVariants({ variant: "default" })}>
          Start a new order
        </Link>
        <Link href="/purchase-orders-overview" className={buttonVariants({ variant: "outline" })}>
          Purchase orders
        </Link>
      </CardContent>
    </Card>
  );
}
