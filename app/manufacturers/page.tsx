import { ManufacturersView } from "./manufacturers-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturers",
};

export default function ManufacturersPage() {
  return <ManufacturersView />;
}
