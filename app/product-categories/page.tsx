import { ProductCategoriesView } from "./product-categories-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Categories",
};

export default function ProductCategoriesPage() {
  return <ProductCategoriesView />;
}
