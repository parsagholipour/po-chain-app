"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  API_TOKEN_SCOPES,
  API_TOKEN_SCOPE_LABELS,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type ApiTokenScope,
  type WebhookEvent,
} from "@/lib/developer-api-constants";
import type {
  ApiTokenCreateResponse,
  ApiTokenRow,
  PaginatedResponse,
  WebhookDeliveryRow,
  WebhookEndpointRow,
  WebhookEndpointSecretResponse,
} from "@/lib/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableContainer } from "@/components/ui/table-container";
import { Textarea } from "@/components/ui/textarea";

const apiTokensKey = ["api-tokens"] as const;
const webhookEndpointsKey = ["webhook-endpoints"] as const;
const webhookDeliveriesKey = ["webhook-deliveries"] as const;

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires", days: null },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
] as const;

const DELIVERY_PAGE_SIZE = 10;
const allDeliveryStatuses = "__all__";

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

/** One-time secret panel: the value can never be retrieved again. */
function RevealedSecret({
  title,
  description,
  value,
  onDismiss,
}: {
  title: string;
  description: string;
  value: string;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => copyToClipboard(value)}
          aria-label="Copy value"
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
        I saved it
      </Button>
    </div>
  );
}

export function DevelopersSettingsView() {
  return (
    <div className="space-y-6 pt-4">
      <ApiTokensCard />
      <WebhookEndpointsCard />
      <WebhookDeliveriesCard />
    </div>
  );
}

function ApiTokensCard() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ApiTokenRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRow | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const { data: tokens = [], isPending } = useQuery({
    queryKey: apiTokensKey,
    queryFn: async () => {
      const { data } = await api.get<ApiTokenRow[]>("/api/api-tokens");
      return data;
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (tokenId: string) => {
      await api.delete(`/api/api-tokens/${tokenId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiTokensKey });
      setRevokeTarget(null);
      toast.success("Token revoked");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          API tokens
        </CardTitle>
        <CardDescription>
          Bearer tokens for the public API at <code>/api/v1</code>. Each token is scoped to
          this store and is shown only once when created.
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create token
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {issuedToken ? (
          <RevealedSecret
            title="Your new API token"
            description="Copy it now — it cannot be shown again. Send it as: Authorization: Bearer <token>"
            value={issuedToken}
            onDismiss={() => setIssuedToken(null)}
          />
        ) : null}

        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : tokens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    No API tokens yet.
                  </TableCell>
                </TableRow>
              ) : (
                tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {token.tokenPrefix}…{token.last4}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(token.lastUsedAt)}
                      {token.requestCount > 0 ? ` · ${token.requestCount} requests` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={token.active ? "default" : "secondary"}>
                        {token.revokedAt ? "Revoked" : token.expired ? "Expired" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRenameTarget(token)}
                          aria-label={`Rename ${token.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={!!token.revokedAt}
                          onClick={() => setRevokeTarget(token)}
                          aria-label={`Revoke ${token.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      <ApiTokenCreateDialog
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(token) => {
          setIssuedToken(token);
          setCreateOpen(false);
        }}
      />

      <ApiTokenRenameDialog
        key={renameTarget?.id ?? "rename-closed"}
        token={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Any service still calling the API with "${revokeTarget?.name ?? ""}" will start receiving 401 responses immediately. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeMut.isPending}
              onClick={() => revokeTarget && revokeMut.mutate(revokeTarget.id)}
            >
              {revokeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Revoke token
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ApiTokenCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["products:read"]);
  const [expiry, setExpiry] = useState<string>("never");

  const createMut = useMutation({
    mutationFn: async () => {
      const days = EXPIRY_OPTIONS.find((option) => option.value === expiry)?.days ?? null;
      const { data } = await api.post<ApiTokenCreateResponse>("/api/api-tokens", {
        name,
        scopes,
        expiresInDays: days,
      });
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: apiTokensKey });
      onCreated(row.token);
      toast.success("API token created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  function toggleScope(scope: ApiTokenScope, checked: boolean) {
    setScopes((current) =>
      checked ? [...new Set([...current, scope])] : current.filter((s) => s !== scope),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API token</DialogTitle>
          <DialogDescription>
            The token value is displayed once. Store it in the consuming service before
            closing this dialog.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="api-token-name">Name</FieldLabel>
              <Input
                id="api-token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Warehouse sync service"
                autoFocus
              />
              <FieldDescription>
                Used to identify the token when reviewing usage.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Scopes</FieldLabel>
              <div className="space-y-2">
                {API_TOKEN_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    checked={scopes.includes(scope)}
                    onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                    label={
                      <span className="text-sm">
                        <code className="text-xs">{scope}</code>
                        <span className="text-muted-foreground">
                          {" "}
                          — {API_TOKEN_SCOPE_LABELS[scope]}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="api-token-expiry">Expiry</FieldLabel>
              <Select
                value={expiry}
                onValueChange={(value) => setExpiry(value ?? "never")}
              >
                <SelectTrigger id="api-token-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={createMut.isPending || name.trim().length === 0 || scopes.length === 0}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiTokenRenameDialog({
  token,
  onOpenChange,
}: {
  token: ApiTokenRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(token?.name ?? "");

  const renameMut = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/api-tokens/${token!.id}`, { name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiTokensKey });
      onOpenChange(false);
      toast.success("Token renamed");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open={!!token} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename token</DialogTitle>
          <DialogDescription>Renaming does not change the token value.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field>
            <FieldLabel htmlFor="api-token-rename">Name</FieldLabel>
            <Input
              id="api-token-rename"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={renameMut.isPending || name.trim().length === 0}
            onClick={() => renameMut.mutate()}
          >
            {renameMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookEndpointsCard() {
  const qc = useQueryClient();
  const [formTarget, setFormTarget] = useState<WebhookEndpointRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointRow | null>(null);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);

  const { data: endpoints = [], isPending } = useQuery({
    queryKey: webhookEndpointsKey,
    queryFn: async () => {
      const { data } = await api.get<WebhookEndpointRow[]>("/api/webhook-endpoints");
      return data;
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await api.patch(`/api/webhook-endpoints/${id}`, { enabled });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: webhookEndpointsKey });
      toast.success("Endpoint updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const testMut = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ status: string; responseStatus: number | null; lastError: string | null }>(
        `/api/webhook-endpoints/${id}/test`,
      );
      return data;
    },
    onSuccess: (delivery) => {
      qc.invalidateQueries({ queryKey: webhookDeliveriesKey });
      qc.invalidateQueries({ queryKey: webhookEndpointsKey });
      if (delivery.status === "succeeded") {
        toast.success(`Test event delivered (HTTP ${delivery.responseStatus})`);
      } else {
        toast.error(`Test event failed: ${delivery.lastError ?? "unknown error"}`);
      }
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const rotateMut = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<WebhookEndpointSecretResponse>(
        `/api/webhook-endpoints/${id}/rotate-secret`,
      );
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: webhookEndpointsKey });
      setIssuedSecret(row.secret);
      toast.success("Signing secret rotated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/webhook-endpoints/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: webhookEndpointsKey });
      setDeleteTarget(null);
      toast.success("Endpoint deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-4" aria-hidden />
          Webhook endpoints
        </CardTitle>
        <CardDescription>
          Each event is POSTed as JSON and signed with the endpoint&apos;s secret in the{" "}
          <code>X-PO-Signature</code> header. Failed deliveries retry for about nine hours.
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={() => setFormTarget("new")}>
            <Plus className="size-4" />
            Add endpoint
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {issuedSecret ? (
          <RevealedSecret
            title="Webhook signing secret"
            description="Copy it now — it cannot be shown again. Use it to verify the X-PO-Signature header."
            value={issuedSecret}
            onDismiss={() => setIssuedSecret(null)}
          />
        ) : null}

        <div className="divide-y divide-border/70 rounded-lg border border-border/80">
          {isPending ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : endpoints.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No webhook endpoints yet.
            </div>
          ) : (
            endpoints.map((endpoint) => (
              <div key={endpoint.id} className="space-y-3 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={endpoint.enabled ? "default" : "secondary"}>
                        {endpoint.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <span className="truncate font-mono text-sm">{endpoint.url}</span>
                    </div>
                    {endpoint.description ? (
                      <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {endpoint.events.map((event) => (
                        <Badge key={event} variant="outline">
                          {event}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Secret ···{endpoint.secretLast4} · Last success{" "}
                      {formatDateTime(endpoint.lastSuccessAt)}
                      {endpoint.consecutiveFailures > 0
                        ? ` · ${endpoint.consecutiveFailures} consecutive failures`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!endpoint.enabled || testMut.isPending}
                      onClick={() => testMut.mutate(endpoint.id)}
                    >
                      {testMut.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Test
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={toggleMut.isPending}
                      onClick={() =>
                        toggleMut.mutate({ id: endpoint.id, enabled: !endpoint.enabled })
                      }
                    >
                      {endpoint.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setFormTarget(endpoint)}
                      aria-label="Edit endpoint"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={rotateMut.isPending}
                      onClick={() => rotateMut.mutate(endpoint.id)}
                      aria-label="Rotate signing secret"
                      title="Rotate signing secret"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(endpoint)}
                      aria-label="Delete endpoint"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      <WebhookEndpointDialog
        key={formTarget === "new" ? "new" : (formTarget?.id ?? "endpoint-closed")}
        target={formTarget}
        onOpenChange={(open) => {
          if (!open) setFormTarget(null);
        }}
        onCreated={(secret) => {
          setIssuedSecret(secret);
          setFormTarget(null);
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${deleteTarget?.url ?? ""} will stop receiving events, and its delivery history is removed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete endpoint
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function WebhookEndpointDialog({
  target,
  onOpenChange,
  onCreated,
}: {
  target: WebhookEndpointRow | "new" | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string) => void;
}) {
  const qc = useQueryClient();
  const existing = target === "new" || target === null ? null : target;
  const [url, setUrl] = useState(existing?.url ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>(
    (existing?.events as WebhookEvent[]) ?? [...WEBHOOK_EVENTS],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { url, description, events };
      if (existing) {
        await api.patch(`/api/webhook-endpoints/${existing.id}`, payload);
        return null;
      }
      const { data } = await api.post<WebhookEndpointSecretResponse>(
        "/api/webhook-endpoints",
        payload,
      );
      return data.secret;
    },
    onSuccess: (secret) => {
      qc.invalidateQueries({ queryKey: webhookEndpointsKey });
      if (secret) {
        onCreated(secret);
      } else {
        onOpenChange(false);
      }
      toast.success(existing ? "Endpoint updated" : "Endpoint created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  function toggleEvent(event: WebhookEvent, checked: boolean) {
    setEvents((current) =>
      checked ? [...new Set([...current, event])] : current.filter((e) => e !== event),
    );
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit endpoint" : "Add webhook endpoint"}</DialogTitle>
          <DialogDescription>
            Events are delivered as HTTP POST with a JSON body. Respond with any 2xx status
            within 10 seconds to acknowledge.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="webhook-url">Endpoint URL</FieldLabel>
              <Input
                id="webhook-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://partner.example.com/hooks/po-app"
                autoFocus
              />
              <FieldDescription>
                Must be https in production. Private and loopback addresses are rejected
                there.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="webhook-description">Description</FieldLabel>
              <Textarea
                id="webhook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What consumes this endpoint?"
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel>Events</FieldLabel>
              <div className="space-y-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <Checkbox
                    key={event}
                    checked={events.includes(event)}
                    onCheckedChange={(checked) => toggleEvent(event, checked === true)}
                    label={
                      <span className="text-sm">
                        <code className="text-xs">{event}</code>
                        <span className="text-muted-foreground">
                          {" "}
                          — {WEBHOOK_EVENT_LABELS[event]}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saveMut.isPending || url.trim().length === 0 || events.length === 0}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {existing ? "Save changes" : "Create endpoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookDeliveriesCard() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>(allDeliveryStatuses);
  const [page, setPage] = useState(1);

  const { data, isPending, isFetching } = useQuery({
    queryKey: [...webhookDeliveriesKey, status, page] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(DELIVERY_PAGE_SIZE),
      });
      if (status !== allDeliveryStatuses) params.set("status", status);
      const { data } = await api.get<PaginatedResponse<WebhookDeliveryRow>>(
        `/api/webhook-deliveries?${params.toString()}`,
      );
      return data;
    },
  });

  const retryMut = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data } = await api.post<WebhookDeliveryRow>(
        `/api/webhook-deliveries/${deliveryId}/retry`,
      );
      return data;
    },
    onSuccess: (delivery) => {
      qc.invalidateQueries({ queryKey: webhookDeliveriesKey });
      if (delivery.status === "succeeded") toast.success("Delivery succeeded");
      else toast.error(`Delivery failed: ${delivery.lastError ?? "unknown error"}`);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / DELIVERY_PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Recent deliveries</CardTitle>
        <CardDescription>
          Every attempt is recorded. Failed deliveries can be replayed by hand after the
          automatic retries are exhausted.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value ?? allDeliveryStatuses);
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="w-[140px]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allDeliveryStatuses}>All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => qc.invalidateQueries({ queryKey: webhookDeliveriesKey })}
            >
              <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    No deliveries yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-mono text-xs">{delivery.event}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                      {delivery.endpoint.url}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          delivery.status === "succeeded"
                            ? "default"
                            : delivery.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {delivery.status}
                      </Badge>
                      {delivery.responseStatus ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          HTTP {delivery.responseStatus}
                        </span>
                      ) : null}
                      {delivery.lastError ? (
                        <p
                          className="mt-1 max-w-[260px] truncate text-xs text-destructive"
                          title={delivery.lastError}
                        >
                          {delivery.lastError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {delivery.attemptCount}
                      {delivery.nextAttemptAt && delivery.status === "pending"
                        ? ` · next ${formatDateTime(delivery.nextAttemptAt)}`
                        : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(delivery.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={retryMut.isPending || delivery.status === "succeeded"}
                        onClick={() => retryMut.mutate(delivery.id)}
                        aria-label="Replay delivery"
                        title="Replay delivery"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
