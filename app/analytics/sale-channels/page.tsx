import type { Metadata } from "next";
import { SaleChannelsView } from "@/components/analytics/views/sale-channels-view";

export const metadata: Metadata = {
  title: "Analytics - Sale Channels",
};

export default function SaleChannelsAnalyticsPage() {
  return <SaleChannelsView />;
}
