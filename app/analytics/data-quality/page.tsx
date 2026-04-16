import type { Metadata } from "next";
import { DataQualityView } from "@/components/analytics/views/data-quality-view";

export const metadata: Metadata = {
  title: "Analytics - Data Quality",
};

export default function DataQualityAnalyticsPage() {
  return <DataQualityView />;
}
