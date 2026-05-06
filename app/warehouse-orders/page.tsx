import type { Metadata } from "next";
import { WarehouseOrdersListView } from "./warehouse-orders-list-view";

export const metadata: Metadata = {
  title: "Warehouse Orders",
};

export default function WarehouseOrdersPage() {
  return <WarehouseOrdersListView />;
}
