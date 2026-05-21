"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceView } from "@/components/ui/price-view";

type DistributorOrderInvoice = {
  id: string;
  invoiceNumber: string;
  paymentStatus: "unpaid" | "pending" | "paid" | "failed" | "cancelled";
  currency: string;
  totalAmount: string | number;
  paidAt: string | null;
  draftPurchaseOrders: Array<{
    id: string;
    name: string;
    status: string;
    destinationKey: string;
    shipToLocationName: string | null;
    saleChannelLocation: { id: string; name: string } | null;
    convertedPurchaseOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
    } | null;
  }>;
  paymentAttempts: Array<{
    id: string;
    provider: string;
    status: string;
  }>;
};

function statusCopy(invoice: DistributorOrderInvoice | undefined) {
  if (!invoice) {
    return {
      icon: Loader2,
      title: "Checking order",
      description: "Loading the status for this order.",
      tone: "text-muted-foreground",
      spin: true,
    };
  }

  const converted = invoice.draftPurchaseOrders.every((draft) => draft.convertedPurchaseOrder);
  const paymentRequired = invoice.paymentAttempts.length > 0;
  if (converted && !paymentRequired) {
    return {
      icon: CheckCircle2,
      title: "Order placed",
      description: "Your purchase orders have been created.",
      tone: "text-emerald-600 dark:text-emerald-400",
      spin: false,
    };
  }
  if (invoice.paymentStatus === "paid" && converted) {
    return {
      icon: CheckCircle2,
      title: "Payment received",
      description: "Your purchase orders have been created.",
      tone: "text-emerald-600 dark:text-emerald-400",
      spin: false,
    };
  }
  if (invoice.paymentStatus === "failed" || invoice.paymentStatus === "cancelled") {
    return {
      icon: XCircle,
      title: "Payment was not completed",
      description: "No purchase orders were created for this invoice.",
      tone: "text-destructive",
      spin: false,
    };
  }
  return {
    icon: Clock,
    title: paymentRequired ? "Payment is processing" : "Order is processing",
    description: paymentRequired
      ? "Stripe is confirming the payment. This page will update automatically."
      : "Your purchase orders are being created. This page will update automatically.",
    tone: "text-amber-600 dark:text-amber-400",
    spin: false,
  };
}

export function NewOrderSuccessView() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("invoiceId");

  const {
    data: invoice,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["distributor-order-invoice", invoiceId],
    enabled: Boolean(invoiceId),
    refetchInterval: (query) => {
      const data = query.state.data as DistributorOrderInvoice | undefined;
      if (!data) return 2500;
      const converted = data.draftPurchaseOrders.every((draft) => draft.convertedPurchaseOrder);
      return data.paymentStatus === "paid" && converted ? false : 2500;
    },
    queryFn: async () => {
      const { data } = await api.get<DistributorOrderInvoice>(
        `/api/distributor-order-invoices/${invoiceId}`,
      );
      return data;
    },
  });

  if (!invoiceId) {
    return (
      <Card className="mx-auto max-w-lg border-border/80 text-center">
        <CardHeader>
          <CardTitle>Missing invoice</CardTitle>
          <CardDescription>The order status link did not include an invoice id.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/new-order" className={buttonVariants({ variant: "default" })}>
            Start a new order
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="mx-auto max-w-lg border-border/80 text-center">
        <CardHeader>
          <CardTitle>Couldn&apos;t load order status</CardTitle>
          <CardDescription>{apiErrorMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Retrying..." : "Try again"}
          </Button>
          <Link href="/purchase-orders-overview" className={buttonVariants({ variant: "outline" })}>
            Purchase orders
          </Link>
        </CardContent>
      </Card>
    );
  }

  const copy = statusCopy(invoice);
  const Icon = copy.icon;
  const converted = invoice?.draftPurchaseOrders.every((draft) => draft.convertedPurchaseOrder) ?? false;
  const paymentRequired = (invoice?.paymentAttempts.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="border-border/80 text-center">
        <CardHeader className="items-center">
          <Icon
            className={cn("size-10", copy.tone, copy.spin || isPending ? "animate-spin" : "")}
          />
          <div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </div>
        </CardHeader>
        {invoice ? (
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Invoice:</span>{" "}
              <span className="font-medium">{invoice.invoiceNumber}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Total:</span>{" "}
              <PriceView value={invoice.totalAmount} />
            </p>
            {!converted && invoice.paymentStatus !== "failed" && invoice.paymentStatus !== "cancelled" ? (
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {paymentRequired ? "Waiting for payment confirmation..." : "Creating purchase orders..."}
              </p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      {invoice ? (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>
              Each active location receives a separate purchase order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/70 rounded-lg border border-border/80">
              {invoice.draftPurchaseOrders.map((draft) => (
                <div
                  key={draft.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {draft.saleChannelLocation?.name ?? draft.shipToLocationName ?? "Location"}
                    </p>
                    <p className="text-sm text-muted-foreground">{draft.name}</p>
                  </div>
                  {draft.convertedPurchaseOrder ? (
                    <Link
                      href={`/purchase-orders/${draft.convertedPurchaseOrder.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                    >
                      PO #{draft.convertedPurchaseOrder.number}
                      <ExternalLink className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pending</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/new-order" className={buttonVariants({ variant: "outline" })}>
          New order
        </Link>
        <Link href="/purchase-orders-overview" className={buttonVariants({ variant: "default" })}>
          Purchase orders
        </Link>
      </div>
    </div>
  );
}
