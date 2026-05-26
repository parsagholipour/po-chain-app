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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_STORE_THEME,
  STORE_BODY_FONT_FAMILY_OPTIONS,
  STORE_HEADING_FONT_FAMILY_OPTIONS,
  type StoreTheme,
} from "@/lib/store-theme";
import { uploadFileToStorage } from "@/lib/upload-client";

export type StoreSettingsStore = {
  id: string;
  name: string;
  logoKey: string | null;
  theme: StoreTheme;
};

function themesEqual(a: StoreTheme, b: StoreTheme) {
  return (
    a.primaryColor === b.primaryColor &&
    a.primaryForegroundColor === b.primaryForegroundColor &&
    a.logoHueRotateDeg === b.logoHueRotateDeg &&
    a.bodyFontFamily === b.bodyFontFamily &&
    a.headingFontFamily === b.headingFontFamily
  );
}

export function StoreSettingsView({
  store,
}: {
  store: StoreSettingsStore | null;
}) {
  const router = useRouter();
  const [currentStore, setCurrentStore] = useState(store);
  const [theme, setTheme] = useState<StoreTheme>(
    store?.theme ?? DEFAULT_STORE_THEME,
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentStore(store);
    setTheme(store?.theme ?? DEFAULT_STORE_THEME);
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
  const hasThemeChanges = !themesEqual(theme, currentStore.theme);
  const hasChanges = Boolean(logoFile || removeStoredLogo || hasThemeChanges);

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

      const result = await updateStoreSettings({ logoKey, theme });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setCurrentStore(result.store);
      setTheme(result.store.theme);
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

      <FieldGroup className="mt-5 border-t pt-5">
        <Field>
          <FieldLabel htmlFor="store-title-font">Title font</FieldLabel>
          <FieldContent>
            <Select
              value={theme.headingFontFamily}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                setTheme((current) => ({
                  ...current,
                  headingFontFamily: value,
                }));
              }}
              items={STORE_HEADING_FONT_FAMILY_OPTIONS}
              disabled={isSaving}
            >
              <SelectTrigger id="store-title-font" className="w-full sm:w-[260px]">
                <SelectValue placeholder="Title font" />
              </SelectTrigger>
              <SelectContent>
                {STORE_HEADING_FONT_FAMILY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="store-body-font">Normal text font</FieldLabel>
          <FieldContent>
            <Select
              value={theme.bodyFontFamily}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                setTheme((current) => ({
                  ...current,
                  bodyFontFamily: value,
                }));
              }}
              items={STORE_BODY_FONT_FAMILY_OPTIONS}
              disabled={isSaving}
            >
              <SelectTrigger id="store-body-font" className="w-full sm:w-[260px]">
                <SelectValue placeholder="Normal text font" />
              </SelectTrigger>
              <SelectContent>
                {STORE_BODY_FONT_FAMILY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              setTheme(currentStore.theme);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}
