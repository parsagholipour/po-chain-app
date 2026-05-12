import { Suspense } from "react";
import { ProductsView } from "./products-view";
import { SaleChannelProductsView } from "./sale-channel-products-view";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Products",
};

export default async function ProductsPage() {
  const session = await auth();
  const isDistributor = session?.user.type === "distributor";

  return (
    <Suspense fallback={null}>
      {isDistributor ? <SaleChannelProductsView /> : <ProductsView />}
    </Suspense>
  );
}
