import { NewManufacturingOrderWizard } from "./new-mo-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Manufacturing Order",
};

export default function NewManufacturingOrderPage() {
  return <NewManufacturingOrderWizard />;
}
