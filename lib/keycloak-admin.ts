import "server-only";

type KeycloakUserRepresentation = {
  id?: string;
  username?: string;
  email?: string;
};

type KeycloakUserSessionRepresentation = {
  id?: string;
  username?: string;
  userId?: string;
  ipAddress?: string;
  start?: number;
  lastAccess?: number;
  rememberMe?: boolean;
  clients?: Record<string, string>;
};

export type KeycloakUserSession = {
  id: string;
  ipAddress: string | null;
  startedAt: Date | null;
  lastAccessedAt: Date | null;
  rememberMe: boolean;
  clients: string[];
};

const DISTRIBUTOR_KEYCLOAK_LAST_NAME = "distributor";

type KeycloakAdminLocation = {
  baseUrl: string;
  realm: string;
  tokenUrl: string;
  adminRealmUrl: string;
  usersUrl: string;
};

export class KeycloakAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeycloakAdminConfigError";
  }
}

export class KeycloakAdminError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "KeycloakAdminError";
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new KeycloakAdminConfigError(`${name} is required for Keycloak admin API access`);
  }
  return value;
}

export function isKeycloakAdminConfigured() {
  return Boolean(
    process.env.AUTH_KEYCLOAK_ISSUER?.trim() &&
      process.env.AUTH_KEYCLOAK_ADMIN_CLIENT_ID?.trim() &&
      process.env.AUTH_KEYCLOAK_ADMIN_CLIENT_SECRET?.trim(),
  );
}

function adminLocationFromIssuer(issuer: string): KeycloakAdminLocation {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new KeycloakAdminConfigError("AUTH_KEYCLOAK_ISSUER must be a valid URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const realmsIndex = parts.lastIndexOf("realms");
  const realm = realmsIndex >= 0 ? parts[realmsIndex + 1] : undefined;
  if (!realm) {
    throw new KeycloakAdminConfigError(
      "AUTH_KEYCLOAK_ISSUER must include /realms/{realm}",
    );
  }

  const basePath = parts.slice(0, realmsIndex).join("/");
  const baseUrl = `${url.origin}${basePath ? `/${basePath}` : ""}`;
  const realmPath = `${baseUrl}/realms/${encodeURIComponent(realm)}`;
  const adminRealmUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}`;

  return {
    baseUrl,
    realm,
    tokenUrl: `${realmPath}/protocol/openid-connect/token`,
    adminRealmUrl,
    usersUrl: `${adminRealmUrl}/users`,
  };
}

function keycloakAdminLocationFromEnv() {
  const issuer = requiredEnv("AUTH_KEYCLOAK_ISSUER");
  return adminLocationFromIssuer(issuer);
}

async function getAdminAccessToken(location: KeycloakAdminLocation) {
  const clientId = requiredEnv("AUTH_KEYCLOAK_ADMIN_CLIENT_ID");
  const clientSecret = requiredEnv("AUTH_KEYCLOAK_ADMIN_CLIENT_SECRET");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(location.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await response.json().catch(() => null)) as
    | { access_token?: string; error_description?: string; error?: string }
    | null;

  if (!response.ok || !json?.access_token) {
    throw new KeycloakAdminError(
      json?.error_description ?? json?.error ?? "Could not obtain Keycloak admin token",
      response.status,
    );
  }

  return json.access_token;
}

async function keycloakFetch(
  location: KeycloakAdminLocation,
  pathOrUrl: string,
  init: RequestInit = {},
) {
  const token = await getAdminAccessToken(location);
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${location.usersUrl}${pathOrUrl}`;

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

async function findKeycloakUserByEmail(
  location: KeycloakAdminLocation,
  email: string,
) {
  const params = new URLSearchParams({
    email,
    exact: "true",
    max: "2",
  });
  const response = await keycloakFetch(location, `?${params.toString()}`);
  const users = (await response.json().catch(() => null)) as
    | KeycloakUserRepresentation[]
    | null;

  if (!response.ok || !Array.isArray(users)) {
    throw new KeycloakAdminError("Could not look up Keycloak user", response.status);
  }

  return users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

function keycloakTimestampToDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const ms = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueClientNames(clients: Record<string, string> | undefined) {
  if (!clients) return [];
  const values = Object.values(clients).filter((value) => value.trim().length > 0);
  const names = values.length > 0 ? values : Object.keys(clients);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function keycloakSessionFromRepresentation(
  row: KeycloakUserSessionRepresentation,
): KeycloakUserSession | null {
  if (!row.id) return null;
  return {
    id: row.id,
    ipAddress: row.ipAddress ?? null,
    startedAt: keycloakTimestampToDate(row.start),
    lastAccessedAt: keycloakTimestampToDate(row.lastAccess),
    rememberMe: row.rememberMe === true,
    clients: uniqueClientNames(row.clients),
  };
}

async function updateKeycloakUser(
  location: KeycloakAdminLocation,
  userId: string,
  input: { email: string; name: string | null },
  options: { updateUsername?: boolean } = {},
) {
  const body: KeycloakUserRepresentation & {
    firstName?: string;
    lastName: string;
    enabled: boolean;
    emailVerified: boolean;
  } = {
    email: input.email,
    firstName: input.name ?? undefined,
    lastName: DISTRIBUTOR_KEYCLOAK_LAST_NAME,
    enabled: true,
    emailVerified: true,
  };
  if (options.updateUsername !== false) {
    body.username = input.email;
  }

  const response = await keycloakFetch(location, `/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new KeycloakAdminError("Could not update Keycloak user", response.status);
  }
}

function isRecoverableExistingUserUpdateError(error: unknown) {
  return error instanceof KeycloakAdminError && (error.status === 404 || error.status === 409);
}

async function updateExistingKeycloakUser(
  location: KeycloakAdminLocation,
  userId: string,
  input: { email: string; name: string | null },
) {
  try {
    await updateKeycloakUser(location, userId, input);
    return true;
  } catch (error) {
    if (!(error instanceof KeycloakAdminError) || error.status !== 400) {
      if (isRecoverableExistingUserUpdateError(error)) return false;
      throw error;
    }
  }

  // Some realms disallow username edits even for admin clients; keep the user and update email only.
  try {
    await updateKeycloakUser(location, userId, input, { updateUsername: false });
    return true;
  } catch (error) {
    if (isRecoverableExistingUserUpdateError(error)) return false;
    throw error;
  }
}

async function resetKeycloakPassword(
  location: KeycloakAdminLocation,
  userId: string,
  password: string,
) {
  const response = await keycloakFetch(
    location,
    `/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary: false,
      }),
    },
  );

  if (!response.ok) {
    throw new KeycloakAdminError("Could not set Keycloak password", response.status);
  }
}

export async function provisionDistributorKeycloakUser(input: {
  email: string;
  name: string | null;
  password?: string | null;
  existingUserId?: string | null;
}) {
  const location = keycloakAdminLocationFromEnv();
  const email = input.email.trim().toLowerCase();

  const existingUserId = input.existingUserId;
  if (existingUserId) {
    const updatedExistingUser = await updateExistingKeycloakUser(location, existingUserId, {
      email,
      name: input.name,
    });

    if (updatedExistingUser) {
      if (input.password) {
        await resetKeycloakPassword(location, existingUserId, input.password);
      }
      return { id: existingUserId, created: false };
    }
  }

  const existing = await findKeycloakUserByEmail(location, email);
  if (existing?.id) {
    await updateKeycloakUser(location, existing.id, { email, name: input.name });
    if (input.password) {
      await resetKeycloakPassword(location, existing.id, input.password);
    }
    return { id: existing.id, created: false };
  }

  const response = await keycloakFetch(location, "", {
    method: "POST",
    body: JSON.stringify({
      username: email,
      email,
      firstName: input.name ?? undefined,
      lastName: DISTRIBUTOR_KEYCLOAK_LAST_NAME,
      enabled: true,
      emailVerified: true,
      credentials: input.password
        ? [
            {
              type: "password",
              value: input.password,
              temporary: false,
            },
          ]
        : undefined,
    }),
  });

  if (!response.ok) {
    throw new KeycloakAdminError("Could not create Keycloak user", response.status);
  }

  const locationHeader = response.headers.get("location");
  const id = locationHeader?.split("/").filter(Boolean).pop();
  if (id) return { id, created: true };

  const created = await findKeycloakUserByEmail(location, email);
  if (!created?.id) {
    throw new KeycloakAdminError("Keycloak user was created but its id could not be resolved");
  }
  return { id: created.id, created: true };
}

export async function resetDistributorKeycloakPassword(
  keycloakUserId: string,
  password: string,
) {
  const location = keycloakAdminLocationFromEnv();
  await resetKeycloakPassword(location, keycloakUserId, password);
}

export async function listKeycloakUserSessions(
  keycloakUserId: string,
): Promise<KeycloakUserSession[]> {
  const location = keycloakAdminLocationFromEnv();
  const response = await keycloakFetch(
    location,
    `/${encodeURIComponent(keycloakUserId)}/sessions`,
  );
  const json = (await response.json().catch(() => null)) as
    | KeycloakUserSessionRepresentation[]
    | null;

  if (!response.ok || !Array.isArray(json)) {
    throw new KeycloakAdminError("Could not list Keycloak user sessions", response.status);
  }

  return json
    .map((row) => keycloakSessionFromRepresentation(row))
    .filter((row): row is KeycloakUserSession => row !== null);
}

export async function deleteKeycloakSession(sessionId: string) {
  const location = keycloakAdminLocationFromEnv();
  const response = await keycloakFetch(
    location,
    `${location.adminRealmUrl}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );

  if (!response.ok && response.status !== 404) {
    throw new KeycloakAdminError("Could not delete Keycloak session", response.status);
  }
}

export async function keycloakUserSessionExists(
  keycloakUserId: string,
  sessionId: string,
) {
  const sessions = await listKeycloakUserSessions(keycloakUserId);
  return sessions.some((session) => session.id === sessionId);
}
