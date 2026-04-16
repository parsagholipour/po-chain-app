import type { Metadata } from "next";
import { OverviewView } from "@/components/analytics/views/overview-view";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsOverviewPage() {
  return <OverviewView />;
}
