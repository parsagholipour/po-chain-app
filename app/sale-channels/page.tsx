import { Suspense } from "react";
import { SaleChannelsView } from "./sale-channels-view";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sale Channels",
};

export default async function SaleChannelsPage() {
  const session = await auth();

  return (
    <Suspense fallback={null}>
      <SaleChannelsView userType={session?.user.type ?? null} />
    </Suspense>
  );
}
