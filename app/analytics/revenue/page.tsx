import type { Metadata } from "next";
import { RevenueView } from "@/components/analytics/views/revenue-view";

export const metadata: Metadata = {
  title: "Analytics - Sales & Profit",
};

export default function RevenueAnalyticsPage() {
  return <RevenueView />;
}
