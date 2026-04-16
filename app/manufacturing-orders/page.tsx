import { ManufacturingOrdersListView } from "./manufacturing-orders-list-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturing Orders",
};

export default function ManufacturingOrdersPage() {
  return <ManufacturingOrdersListView />;
}
