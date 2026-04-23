import { Suspense } from "react";
import { SaleChannelsView } from "./sale-channels-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sale Channels",
};

export default function SaleChannelsPage() {
  return (
    <Suspense fallback={null}>
      <SaleChannelsView />
    </Suspense>
  );
}
