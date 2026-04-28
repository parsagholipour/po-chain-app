import { ProductTypesView } from "./product-types-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Types",
};

export default function ProductTypesPage() {
  return <ProductTypesView />;
}
