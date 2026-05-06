import type { Metadata } from "next";
import { NewWarehouseOrderWizard } from "./new-warehouse-order-wizard";

export const metadata: Metadata = {
  title: "New Warehouse Order",
};

export default function NewWarehouseOrderPage() {
  return <NewWarehouseOrderWizard />;
}
