import { ProductCollectionsView } from "./product-collections-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Collections",
};

export default function ProductCollectionsPage() {
  return <ProductCollectionsView />;
}
