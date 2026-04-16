import type { Metadata } from "next";
import { StockOrdersView } from "@/components/analytics/views/stock-orders-view";

export const metadata: Metadata = {
  title: "Analytics - Stock Orders",
};

export default function StockOrdersAnalyticsPage() {
  return <StockOrdersView />;
}
