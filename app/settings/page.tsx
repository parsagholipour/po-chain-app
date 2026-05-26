import { SettingsView } from "./settings-view";
import type { Metadata } from "next";
import { getStoreContext } from "@/lib/store-context";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const storeContext = await getStoreContext();
  const activeStore = storeContext?.activeStore
    ? {
        id: storeContext.activeStore.id,
        name: storeContext.activeStore.name,
        logoKey: storeContext.activeStore.logoKey,
        theme: storeContext.activeStore.theme,
      }
    : null;

  return <SettingsView activeStore={activeStore} />;
}
