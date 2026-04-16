import { NewStockOrderWizard } from "./new-stock-order-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Stock Order",
};

export default function NewStockOrderPage() {
  return <NewStockOrderWizard />;
}
