"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { SaleChannel, SaleChannelLocation } from "@/lib/types/api";
import { SaleChannelUpsertDialog } from "@/components/po/sale-channels/sale-channel-upsert-dialog";
import { SaleChannelLocationsDialog } from "@/components/po/sale-channels/sale-channel-locations-dialog";
import { SaleChannelsTable } from "@/components/po/sale-channels/sale-channels-table";
import type { SaleChannelFormValues } from "@/components/po/sale-channels/sale-channel-form";
import { SaleChannelLocationUpsertDialog } from "@/components/po/sale-channels/sale-channel-location-upsert-dialog";
import { SaleChannelLocationsTable } from "@/components/po/sale-channels/sale-channel-locations-table";
import type { SaleChannelLocationFormValues } from "@/components/po/sale-channels/sale-channel-location-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { parseUuidParam, useClearIdSearchParam } from "@/lib/url-id-param";
import { usePagination } from "@/hooks/use-pagination";
import { Badge } from "@/components/ui/badge";

export type { SaleChannel } from "@/lib/types/api";

const saleChannelsKey = ["sale-channels"] as const;

type SaleChannelMagicLink = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  active: boolean;
};

type SaleChannelMagicLinkCreateResponse = SaleChannelMagicLink & {
  url: string;
};

function formatMagicLinkDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function DistributorLocationsView() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const clearIdParam = useClearIdSearchParam();
  const idFromUrl = parseUuidParam(searchParams.get("id"));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SaleChannelLocation | null>(null);

  const { data: saleChannels = [], isPending: saleChannelPending } = useQuery({
    queryKey: saleChannelsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });
  const saleChannel = saleChannels[0] ?? null;
  const locationsKey = ["sale-channel-locations", saleChannel?.id] as const;

  const { data: locations = [], isPending: locationsPending } = useQuery({
    queryKey: locationsKey,
    enabled: !!saleChannel,
    queryFn: async () => {
      const { data } = await api.get<SaleChannelLocation[]>(
        `/api/sale-channels/${saleChannel!.id}/locations`,
      );
      return data;
    },
  });
  const isPending = saleChannelPending || (Boolean(saleChannel) && locationsPending);
  const pagination = usePagination({ totalItems: locations.length });
  const pagedRows = pagination.sliceItems(locations);
  const isTablePending = isPending && locations.length === 0;

  useEffect(() => {
    if (!idFromUrl || isPending) return;
    const row = locations.find((r) => r.id === idFromUrl);
    queueMicrotask(() => {
      if (row) {
        setEditing(row);
        setOpen(true);
      } else {
        toast.error("Location not found");
        clearIdParam();
      }
    });
  }, [idFromUrl, isPending, locations, clearIdParam]);

  const createMut = useMutation({
    mutationFn: async (values: SaleChannelLocationFormValues) => {
      if (!saleChannel) throw new Error("No sale channel is assigned to your account");
      const { data } = await api.post<SaleChannelLocation>(
        `/api/sale-channels/${saleChannel.id}/locations`,
        values,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SaleChannelLocationFormValues }) => {
      if (!saleChannel) throw new Error("No sale channel is assigned to your account");
      const { data } = await api.patch<SaleChannelLocation>(
        `/api/sale-channels/${saleChannel.id}/locations/${id}`,
        values,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      if (!saleChannel) throw new Error("No sale channel is assigned to your account");
      await api.delete(`/api/sale-channels/${saleChannel.id}/locations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: {
    id?: string;
    values: SaleChannelLocationFormValues;
  }): Promise<string> {
    if (payload.id) {
      await updateMut.mutateAsync({ id: payload.id, values: payload.values });
      return payload.id;
    }

    const row = await createMut.mutateAsync(payload.values);
    return row.id;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
          <p className="text-sm text-muted-foreground">Manage your shipping locations.</p>
        </div>
        <Button
          type="button"
          disabled={!saleChannel}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add location
        </Button>
      </div>

      <TableContainer
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <SaleChannelLocationsTable
          rows={pagedRows}
          isPending={isTablePending}
          emptyMessage={
            saleChannel ? "No locations yet." : "No sale channel is assigned to your account."
          }
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <SaleChannelLocationUpsertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            clearIdParam();
            setEditing(null);
          }
        }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

export function SaleChannelsView({
  userType,
  saleChannelType,
}: {
  userType: "internal" | "distributor" | null;
  saleChannelType: "distributor" | "store" | "amazon" | "cjdropshipping" | null;
}) {
  if (userType === "distributor" && saleChannelType === "store") {
    return null;
  }

  if (userType === "distributor") {
    return <DistributorLocationsView />;
  }

  return <InternalSaleChannelsView />;
}

function InternalSaleChannelsView() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const clearIdParam = useClearIdSearchParam();
  const idFromUrl = parseUuidParam(searchParams.get("id"));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SaleChannel | null>(null);
  const [locationsFor, setLocationsFor] = useState<SaleChannel | null>(null);
  const [magicLinksFor, setMagicLinksFor] = useState<SaleChannel | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: saleChannelsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });
  const pagination = usePagination({ totalItems: data.length });
  const pagedRows = pagination.sliceItems(data);
  const isTablePending = isPending && data.length === 0;

  useEffect(() => {
    if (!idFromUrl || isPending) return;
    const row = data.find((r) => r.id === idFromUrl);
    queueMicrotask(() => {
      if (row) {
        setEditing(row);
        setOpen(true);
      } else {
        toast.error("Sale channel not found");
        clearIdParam();
      }
    });
  }, [idFromUrl, isPending, data, clearIdParam]);

  const createMut = useMutation({
    mutationFn: async (values: SaleChannelFormValues) => {
      const { data: row } = await api.post<SaleChannel>("/api/sale-channels", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SaleChannelFormValues }) => {
      const { data: row } = await api.patch<SaleChannel>(`/api/sale-channels/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/sale-channels/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: SaleChannelFormValues }): Promise<string> {
    if (payload.id) {
      await updateMut.mutateAsync({ id: payload.id, values: payload.values });
      return payload.id;
    } else {
      const row = await createMut.mutateAsync(payload.values);
      return row.id;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sale channels</h1>
          <p className="text-sm text-muted-foreground">Where orders are sold or fulfilled.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add sale channel
        </Button>
      </div>

      <TableContainer
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <SaleChannelsTable
          rows={pagedRows}
          isPending={isTablePending}
          onLocations={(row) => setLocationsFor(row)}
          onMagicLinks={(row) => setMagicLinksFor(row)}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <SaleChannelUpsertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            clearIdParam();
            setEditing(null);
          }
        }}
        editing={editing}
        onSave={handleSave}
      />
      <SaleChannelLocationsDialog
        open={!!locationsFor}
        onOpenChange={(next) => {
          if (!next) setLocationsFor(null);
        }}
        saleChannel={locationsFor}
      />
      <SaleChannelMagicLinksDialog
        key={magicLinksFor?.id ?? "closed"}
        open={!!magicLinksFor}
        onOpenChange={(next) => {
          if (!next) setMagicLinksFor(null);
        }}
        saleChannel={magicLinksFor}
      />
    </div>
  );
}

function SaleChannelMagicLinksDialog({
  open,
  onOpenChange,
  saleChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleChannel: SaleChannel | null;
}) {
  const qc = useQueryClient();
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const linksKey = ["sale-channel-magic-links", saleChannel?.id] as const;

  const { data: links = [], isPending } = useQuery({
    queryKey: linksKey,
    enabled: open && Boolean(saleChannel?.id),
    queryFn: async () => {
      const { data } = await api.get<SaleChannelMagicLink[]>(
        `/api/sale-channels/${saleChannel!.id}/magic-links`,
      );
      return data;
    },
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!saleChannel) throw new Error("Select a store sale channel first");
      const { data } = await api.post<SaleChannelMagicLinkCreateResponse>(
        `/api/sale-channels/${saleChannel.id}/magic-links`,
      );
      return data;
    },
    onSuccess: (row) => {
      setGeneratedUrl(row.url);
      qc.invalidateQueries({ queryKey: linksKey });
      toast.success("Magic link generated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const revokeMut = useMutation({
    mutationFn: async (linkId: string) => {
      if (!saleChannel) throw new Error("Select a store sale channel first");
      await api.delete(`/api/sale-channels/${saleChannel.id}/magic-links/${linkId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linksKey });
      toast.success("Magic link revoked");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function copyGeneratedLink() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>Magic links</DialogTitle>
          <DialogDescription>{saleChannel?.name ?? "Store sale channel"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Generated links stay active for 7 days unless revoked.
            </div>
            <Button
              type="button"
              onClick={() => generateMut.mutate()}
              disabled={!saleChannel || generateMut.isPending}
            >
              {generateMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Generate link
            </Button>
          </div>

          {generatedUrl ? (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
              <div className="flex gap-2">
                <Input value={generatedUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyGeneratedLink}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-border/70 rounded-lg border border-border/80">
            {isPending ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : links.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No magic links yet.
              </div>
            ) : (
              links.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={link.active ? "default" : "secondary"}>
                        {link.active ? "Active" : link.revokedAt ? "Revoked" : "Expired"}
                      </Badge>
                      <span className="text-sm font-medium">
                        Expires {formatMagicLinkDate(link.expiresAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Used {link.useCount} times. Last used {formatMagicLinkDate(link.lastUsedAt)}.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="self-end text-destructive hover:text-destructive sm:self-auto"
                    disabled={!link.active || revokeMut.isPending}
                    onClick={() => revokeMut.mutate(link.id)}
                    aria-label="Revoke magic link"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
