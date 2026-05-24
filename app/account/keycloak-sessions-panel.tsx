"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";

type KeycloakSessionRow = {
  id: string;
  ipAddress: string | null;
  startedAt: string | null;
  lastAccessedAt: string | null;
  clients: string[];
  rememberMe: boolean;
  isCurrent: boolean;
  userAgent: string | null;
  keycloakActive: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function fetchSessions() {
  const response = await api.get<KeycloakSessionRow[]>("/api/account/sessions");
  return response.data;
}

async function logoutOtherSessions() {
  const response = await api.post<{ loggedOutCount: number }>("/api/account/sessions", {
    action: "logout-others",
  });
  return response.data;
}

async function revokeSession(sessionId: string) {
  const response = await api.post<{ loggedOutCount: number }>("/api/account/sessions", {
    action: "revoke",
    sessionId,
  });
  return response.data;
}

export function KeycloakSessionsPanel() {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ["account", "keycloak-sessions"],
    queryFn: fetchSessions,
  });
  const logoutOthers = useMutation({
    mutationFn: logoutOtherSessions,
    onSuccess(data) {
      toast.success(
        data.loggedOutCount === 1
          ? "Signed out 1 other session"
          : `Signed out ${data.loggedOutCount} other sessions`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["account", "keycloak-sessions"],
      });
    },
    onError(error) {
      toast.error(apiErrorMessage(error, "Could not sign out other sessions"));
    },
  });
  const revokeOne = useMutation({
    mutationFn: revokeSession,
    onSuccess() {
      toast.success("Session revoked");
      void queryClient.invalidateQueries({
        queryKey: ["account", "keycloak-sessions"],
      });
    },
    onError(error) {
      toast.error(apiErrorMessage(error, "Could not revoke session"));
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const hasCurrentSession = sessions.some((row) => row.isCurrent);
  const otherSessionCount = sessions.filter((row) => !row.isCurrent).length;
  const canLogoutOthers =
    hasCurrentSession &&
    otherSessionCount > 0 &&
    !logoutOthers.isPending &&
    !revokeOne.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            View your browser sessions and sign out the ones you no longer use.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Refresh sessions"
            title="Refresh sessions"
            disabled={sessionsQuery.isFetching}
            onClick={() => {
              void sessionsQuery.refetch();
            }}
          >
            <RefreshCw
              className={sessionsQuery.isFetching ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canLogoutOthers}
            onClick={() => logoutOthers.mutate()}
          >
            {logoutOthers.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            Sign out other sessions
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sessionsQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading sessions
          </div>
        ) : sessionsQuery.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {apiErrorMessage(sessionsQuery.error, "Could not load sessions")}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active sessions found.</div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            {sessions.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 border-b p-3 text-sm last:border-b-0 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" />
                    <span className="font-medium">{row.ipAddress ?? "Unknown IP"}</span>
                    {row.isCurrent ? <Badge variant="secondary">Current</Badge> : null}
                    {row.rememberMe ? <Badge variant="outline">Remembered</Badge> : null}
                    {row.keycloakActive ? <Badge variant="outline">Keycloak</Badge> : null}
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Started {formatDate(row.startedAt)}</span>
                    <span>Last active {formatDate(row.lastAccessedAt)}</span>
                  </div>
                  {row.userAgent ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {row.userAgent}
                    </div>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:max-w-48 sm:items-end">
                  <div className="text-xs text-muted-foreground sm:text-right">
                    {row.clients.length > 0 ? row.clients.join(", ") : "Unknown client"}
                  </div>
                  {!row.isCurrent ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={logoutOthers.isPending || revokeOne.isPending}
                      onClick={() => revokeOne.mutate(row.id)}
                    >
                      {revokeOne.isPending && revokeOne.variables === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
