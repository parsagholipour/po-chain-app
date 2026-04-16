import { NewPurchaseOrderWizard } from "./new-po-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Purchase Order",
};

export default function NewPurchaseOrderPage() {
  return <NewPurchaseOrderWizard />;
}
