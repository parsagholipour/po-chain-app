import { redirect } from "next/navigation";
import { getSessionStoreContextBundle } from "@/lib/store-context";

export default async function PurchaseOrdersRedirectPage() {
  const { storeContext } = await getSessionStoreContextBundle();
  if (storeContext?.userType === "distributor") {
    redirect("/purchase-orders-overview");
  }
  redirect("/manufacturing-orders");
}
