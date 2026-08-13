import { Suspense } from "react";
import type { Metadata } from "next";
import { WarningsView } from "./warnings-view";

export const metadata: Metadata = {
  title: "Warnings",
};

export default function WarningsPage() {
  return (
    <Suspense fallback={null}>
      <WarningsView />
    </Suspense>
  );
}
