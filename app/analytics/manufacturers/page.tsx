import type { Metadata } from "next";
import { ManufacturersView } from "@/components/analytics/views/manufacturers-view";

export const metadata: Metadata = {
  title: "Analytics - Manufacturers",
};

export default function ManufacturersAnalyticsPage() {
  return <ManufacturersView />;
}
