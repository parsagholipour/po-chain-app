import "server-only";

type KeycloakUserRepresentation = {
  id?: string;
  username?: string;
  email?: string;
};

type KeycloakAdminLocation = {
  baseUrl: string;
  realm: string;
  tokenUrl: string;
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
    throw new KeycloakAdminConfigError(`${name} is required to provision distributor users`);
  }
  return value;
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

  return {
    baseUrl,
    realm,
    tokenUrl: `${realmPath}/protocol/openid-connect/token`,
    usersUrl: `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`,
  };
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

async function updateKeycloakUser(
  location: KeycloakAdminLocation,
  userId: string,
  input: { email: string; name: string | null },
) {
  const response = await keycloakFetch(location, `/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({
      username: input.email,
      email: input.email,
      firstName: input.name ?? undefined,
      enabled: true,
      emailVerified: true,
    }),
  });

  if (!response.ok) {
    throw new KeycloakAdminError("Could not update Keycloak user", response.status);
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
}) {
  const issuer = requiredEnv("AUTH_KEYCLOAK_ISSUER");
  const location = adminLocationFromIssuer(issuer);
  const email = input.email.trim().toLowerCase();

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
