import type { Metadata } from "next";
import { ProductsView } from "@/components/analytics/views/products-view";

export const metadata: Metadata = {
  title: "Analytics - Products",
};

export default function ProductsAnalyticsPage() {
  return <ProductsView />;
}
