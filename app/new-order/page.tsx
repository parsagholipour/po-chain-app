import type { Metadata } from "next";
import { NewOrderView } from "./new-order-view";

export const metadata: Metadata = {
  title: "New Order",
};

export default function NewOrderPage() {
  return <NewOrderView />;
}
