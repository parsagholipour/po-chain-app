import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Warnings",
};

export default function DataQualityAnalyticsPage() {
  redirect("/warnings");
}
