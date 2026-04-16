import type { Metadata } from "next";
import { ShippingView } from "@/components/analytics/views/shipping-view";

export const metadata: Metadata = {
  title: "Analytics - Shipping",
};

export default function ShippingAnalyticsPage() {
  return <ShippingView />;
}
