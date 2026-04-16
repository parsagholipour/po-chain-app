import type { Metadata } from "next";
import { ManufacturingView } from "@/components/analytics/views/manufacturing-view";

export const metadata: Metadata = {
  title: "Analytics - Manufacturing",
};

export default function ManufacturingAnalyticsPage() {
  return <ManufacturingView />;
}
