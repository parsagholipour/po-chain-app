import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SaleChannelsView } from "./sale-channels-view";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sale Channels",
};

export default async function SaleChannelsPage() {
  const session = await auth();

  if (session?.user.type === "distributor" && session.user.saleChannelType === "store") {
    redirect("/new-order");
  }

  return (
    <Suspense fallback={null}>
      <SaleChannelsView
        userType={session?.user.type ?? null}
        saleChannelType={session?.user.saleChannelType ?? null}
      />
    </Suspense>
  );
}
