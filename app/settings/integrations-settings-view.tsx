"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  ProductStockSnapshotBackup,
  ShopifyIntegrationSettings,
  ShopifySyncResult,
  StripeIntegrationSettings,
} from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const shopifyIntegrationKey = ["shopify-integration"] as const;
const stripeIntegrationKey = ["stripe-integration"] as const;
const productStockBackupsKey = ["product-stock-snapshot-backups"] as const;

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (!status) return "Not synced";
  const labels: Record<string, string> = {
    scheduled: "Scheduled sync",
    manual: "Manual sync",
    webhook: "Webhook sync",
    error: "Error",
  };
  return labels[status] ?? status;
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(year, month - 1, day));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function ProductStockBackupsCard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: productStockBackupsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductStockSnapshotBackup[]>(
        "/api/integrations/product-stock-backups",
      );
      return rows;
    },
  });
  const backups = data ?? [];

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Daily stock backups</h2>
        <p className="text-sm text-muted-foreground">
          Product stock CSV snapshots.
        </p>
      </div>

      {isPending ? (
        <p className="py-4 text-sm text-muted-foreground">Loading backups...</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {apiErrorMessage(error)}
        </p>
      ) : backups.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No backups yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Date</span>
            <span>Products</span>
            <span>Size</span>
            <span className="text-right">File</span>
          </div>
          <div className="divide-y">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium">{formatDateOnly(backup.snapshotDate)}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {backup.productCount.toLocaleString()} products / {formatBytes(backup.size)}
                  </p>
                </div>
                <p className="hidden tabular-nums sm:block">
                  {backup.productCount.toLocaleString()}
                </p>
                <p className="hidden tabular-nums sm:block">{formatBytes(backup.size)}</p>
                <div className="sm:flex sm:justify-end">
                  <DocumentDownloadLink
                    documentKey={backup.objectKey}
                    fileName={backup.fileName}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function configuredPlaceholder(last4: string | null) {
  return last4 ? `Configured ending in ${last4}` : "Configured";
}

function StripeIntegrationForm({ data }: { data: StripeIntegrationSettings }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [currency, setCurrency] = useState(data.currency || "usd");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: {
        enabled: boolean;
        currency: string;
        secretKey?: string;
        webhookSecret?: string;
      } = {
        enabled,
        currency: currency.trim().toLowerCase(),
      };
      if (secretKey.trim()) body.secretKey = secretKey.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const { data: row } = await api.patch<StripeIntegrationSettings>(
        "/api/integrations/stripe",
        body,
      );
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData(stripeIntegrationKey, row);
      setSecretKey("");
      setWebhookSecret("");
      toast.success(row.enabled ? "Stripe payments enabled" : "Stripe settings saved");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Stripe</h2>
          <p className="text-sm text-muted-foreground">
            Distributor New Order checkout.
          </p>
        </div>
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          label="Enabled"
        />
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="stripe-currency">Currency</FieldLabel>
          <Input
            id="stripe-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            maxLength={3}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="stripe-secret-key">Secret key</FieldLabel>
            <Input
              id="stripe-secret-key"
              type="password"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder={
                data.hasSecretKey ? configuredPlaceholder(data.secretKeyLast4) : "sk_test_..."
              }
              autoComplete="off"
            />
            {data.hasSecretKey ? (
              <FieldDescription>Leave blank to keep the saved key.</FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="stripe-webhook-secret">Webhook signing secret</FieldLabel>
            <Input
              id="stripe-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder={
                data.hasWebhookSecret
                  ? configuredPlaceholder(data.webhookSecretLast4)
                  : "whsec_..."
              }
              autoComplete="off"
            />
            {data.hasWebhookSecret ? (
              <FieldDescription>Leave blank to keep the saved secret.</FieldDescription>
            ) : null}
          </Field>
        </div>
      </FieldGroup>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          <Save className="size-4" />
          Save
        </Button>
        <p className="text-sm text-muted-foreground">
          Webhook: /api/payments/stripe/webhook
        </p>
      </div>
    </div>
  );
}

function ShopifyIntegrationForm({ data }: { data: ShopifyIntegrationSettings }) {
  const qc = useQueryClient();
  const [shopDomain, setShopDomain] = useState(data.shopDomain);
  const [enabled, setEnabled] = useState(data.enabled);
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: {
        shopDomain: string;
        enabled: boolean;
        accessToken?: string;
        webhookSecret?: string;
      } = {
        shopDomain,
        enabled,
      };
      if (accessToken.trim()) body.accessToken = accessToken.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const { data: row } = await api.patch<ShopifyIntegrationSettings>(
        "/api/integrations/shopify",
        body,
      );
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData(shopifyIntegrationKey, row);
      setAccessToken("");
      setWebhookSecret("");
      toast.success(row.enabled ? "Shopify integration enabled" : "Shopify integration saved");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const startedAt = Date.now();
      console.info("[shopify-sync] Sync now clicked", {
        integrationId: data.id,
        shopDomain: data.shopDomain,
        enabled: data.enabled,
        hasAccessToken: data.hasAccessToken,
      });

      try {
        const { data: result } = await api.post<ShopifySyncResult>(
          "/api/integrations/shopify/sync-now",
        );
        console.info("[shopify-sync] Sync now response", {
          integrationId: result.integrationId,
          skipped: result.skipped,
          reason: result.reason,
          lockExpiresAt: result.lockExpiresAt,
          syncedProductCount: result.syncedProductCount,
          matchedSkuCount: result.matchedSkuCount,
          unmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        console.error("[shopify-sync] Sync now request failed", {
          integrationId: data.id,
          durationMs: Date.now() - startedAt,
          error: apiErrorMessage(error),
        });
        throw error;
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: shopifyIntegrationKey });
      qc.invalidateQueries({ queryKey: productStockBackupsKey });
      qc.invalidateQueries({ queryKey: ["products"] });
      if (result.skipped) {
        toast.info(result.reason ?? "Shopify sync skipped");
      } else {
        toast.success(`Synced ${result.syncedProductCount} product stock count(s)`);
      }
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const canSync = Boolean(data.enabled && data.hasAccessToken);
  const tokenPlaceholder = data.hasAccessToken ? "Configured" : "";
  const secretPlaceholder = data.hasWebhookSecret ? "Configured" : "";
  const statusTone = useMemo(() => {
    if (data.lastSyncStatus === "error") return "text-destructive";
    if (data.enabled) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
  }, [data.enabled, data.lastSyncStatus]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Shopify</h2>
            <p className="text-sm text-muted-foreground">
              Inventory sync for catalog stock counts.
            </p>
          </div>
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            label="Enabled"
          />
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="shopify-shop-domain">Shop domain</FieldLabel>
            <Input
              id="shopify-shop-domain"
              value={shopDomain}
              onChange={(event) => setShopDomain(event.target.value)}
              placeholder="example.myshopify.com"
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="shopify-access-token">Admin API token</FieldLabel>
              <Input
                id="shopify-access-token"
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder={tokenPlaceholder}
                autoComplete="off"
              />
              {data.hasAccessToken ? (
                <FieldDescription>Leave blank to keep the saved token.</FieldDescription>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="shopify-webhook-secret">Webhook signing secret</FieldLabel>
              <Input
                id="shopify-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder={secretPlaceholder}
                autoComplete="off"
              />
              {data.hasWebhookSecret ? (
                <FieldDescription>Leave blank to keep the saved secret.</FieldDescription>
              ) : null}
            </Field>
          </div>
        </FieldGroup>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            <Save className="size-4" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={!canSync || syncMut.isPending}
          >
            <RefreshCw className={syncMut.isPending ? "size-4 animate-spin" : "size-4"} />
            Sync now
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <p className={`mt-1 text-sm font-medium ${statusTone}`}>
              {enabled ? statusLabel(data.lastSyncStatus) : "Disabled"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last sync
            </p>
            <p className="mt-1 text-sm">{formatDate(data.lastSyncAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Products
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastSyncedProductCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              SKUs
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastMatchedSkuCount} matched
              <span className="text-muted-foreground">
                {" "}
                / {data.lastUnmatchedLocalSkuCount} unmatched
              </span>
            </p>
          </div>
        </div>
        {data.lastSyncError ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {data.lastSyncError}
          </p>
        ) : null}
      </div>

      <ProductStockBackupsCard />
    </div>
  );
}

export function IntegrationsSettingsView() {
  const { data: shopifyData, isPending: shopifyPending } = useQuery({
    queryKey: shopifyIntegrationKey,
    queryFn: async () => {
      const { data: row } = await api.get<ShopifyIntegrationSettings>(
        "/api/integrations/shopify",
      );
      return row;
    },
  });
  const { data: stripeData, isPending: stripePending } = useQuery({
    queryKey: stripeIntegrationKey,
    queryFn: async () => {
      const { data: row } = await api.get<StripeIntegrationSettings>(
        "/api/integrations/stripe",
      );
      return row;
    },
  });

  if (shopifyPending || stripePending || !shopifyData || !stripeData) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <StripeIntegrationForm
        key={`stripe:${stripeData.id ?? "new"}:${stripeData.updatedAt ?? "never"}:${stripeData.enabled}`}
        data={stripeData}
      />
      <ShopifyIntegrationForm
        key={`shopify:${shopifyData.id ?? "new"}:${shopifyData.updatedAt ?? "never"}:${shopifyData.enabled}`}
        data={shopifyData}
      />
    </div>
  );
}
