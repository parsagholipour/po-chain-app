import { Suspense } from "react";
import type { Metadata } from "next";
import { NewOrderSuccessView } from "./success-view";

export const metadata: Metadata = {
  title: "Order Payment",
};

export default function NewOrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderSuccessView />
    </Suspense>
  );
}
