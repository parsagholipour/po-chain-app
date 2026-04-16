import { SaleChannelsView } from "./sale-channels-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sale Channels",
};

export default function SaleChannelsPage() {
  return <SaleChannelsView />;
}
