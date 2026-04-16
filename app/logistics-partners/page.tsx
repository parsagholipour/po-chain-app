import { LogisticsPartnersView } from "@/components/po/logistics-partners/logistics-partners-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Logistics Partners",
};

export default function LogisticsPartnersPage() {
  return <LogisticsPartnersView />;
}
