"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateStoreSettings } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ImageFileInput } from "@/components/ui/image-file-input";
import { uploadFileToStorage } from "@/lib/upload-client";

export type StoreSettingsStore = {
  id: string;
  name: string;
  logoKey: string | null;
};

export function StoreSettingsView({
  store,
}: {
  store: StoreSettingsStore | null;
}) {
  const router = useRouter();
  const [currentStore, setCurrentStore] = useState(store);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentStore(store);
    setLogoFile(null);
    setRemoveStoredLogo(false);
  }, [store]);

  if (!currentStore) {
    return (
      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">
          No store is assigned to your account.
        </p>
      </div>
    );
  }

  const existingLogoKey = removeStoredLogo ? null : currentStore.logoKey;
  const hasChanges = Boolean(logoFile || removeStoredLogo);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentStore || !hasChanges) return;

    setIsSaving(true);
    try {
      let logoKey = removeStoredLogo ? null : currentStore.logoKey;
      if (logoFile) {
        logoKey = await uploadFileToStorage(
          logoFile,
          `stores/${currentStore.id}/logo`,
        );
      }

      const result = await updateStoreSettings({ logoKey });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setCurrentStore(result.store);
      setLogoFile(null);
      setRemoveStoredLogo(false);
      toast.success("Store settings saved");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save store settings",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold">Store</h2>
        <p className="text-sm text-muted-foreground">{currentStore.name}</p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="store-logo">Logo</FieldLabel>
          <FieldContent>
            <ImageFileInput
              id="store-logo"
              value={logoFile}
              onChange={(file) => {
                setLogoFile(file);
                if (file) setRemoveStoredLogo(false);
              }}
              existingObjectKey={existingLogoKey}
              onRemoveStored={
                currentStore.logoKey
                  ? () => {
                      setLogoFile(null);
                      setRemoveStoredLogo(true);
                    }
                  : undefined
              }
              variant="logo"
              description={null}
              disabled={isSaving}
            />
          </FieldContent>
        </Field>
      </FieldGroup>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSaving || !hasChanges}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
        {hasChanges ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => {
              setLogoFile(null);
              setRemoveStoredLogo(false);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}
