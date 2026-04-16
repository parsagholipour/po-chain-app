import { PurchaseOrdersListView } from "../purchase-orders/purchase-orders-list-view"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Purchase Orders",
};

export default function PurchaseOrdersPage() {
  return <PurchaseOrdersListView />;
}
