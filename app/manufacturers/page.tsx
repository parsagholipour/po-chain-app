import { Suspense } from "react";
import { ManufacturersView } from "./manufacturers-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturers",
};

export default function ManufacturersPage() {
  return (
    <Suspense fallback={null}>
      <ManufacturersView />
    </Suspense>
  );
}
