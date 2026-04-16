import { StockOrdersListView } from "./stock-orders-list-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Orders",
};

export default function StockOrdersPage() {
  return <StockOrdersListView />;
}
