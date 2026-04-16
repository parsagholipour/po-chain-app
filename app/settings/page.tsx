import { CustomFieldsSettingsView } from "./custom-fields-settings-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return <CustomFieldsSettingsView />;
}
