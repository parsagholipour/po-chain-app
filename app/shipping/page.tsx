import { Suspense } from "react";
import { ShippingView } from "@/components/po/shipping/shipping-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shipping",
};

export default function ShippingPage() {
  return (
    <Suspense fallback={null}>
      <ShippingView />
    </Suspense>
  );
}
