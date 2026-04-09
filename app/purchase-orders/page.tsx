import { redirect } from "next/navigation";

export default function PurchaseOrdersRedirectPage() {
  redirect("/manufacturing-orders");
}
