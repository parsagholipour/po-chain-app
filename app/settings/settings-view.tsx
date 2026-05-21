"use client";

import { useState } from "react";
import { CustomFieldsSettingsView } from "./custom-fields-settings-view";
import { IntegrationsSettingsView } from "./integrations-settings-view";
import {
  StoreSettingsView,
  type StoreSettingsStore,
} from "./store-settings-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SettingsTab = "store" | "custom-fields" | "integrations";

export function SettingsView({
  activeStore,
}: {
  activeStore: StoreSettingsStore | null;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("store");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Store configuration and operational controls.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom fields</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="store">
          <StoreSettingsView store={activeStore} />
        </TabsContent>
        <TabsContent value="custom-fields">
          <CustomFieldsSettingsView showHeader={false} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsSettingsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
