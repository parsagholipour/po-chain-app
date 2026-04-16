import { ProductsView } from "./products-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products",
};

export default function ProductsPage() {
  return <ProductsView />;
}
