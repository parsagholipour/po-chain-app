/** Direct Keycloak OAuth entry (skips Auth.js provider picker). */
export const KEYCLOAK_PROVIDER_ID = "keycloak" as const;

/** Server route that POSTs to Auth.js and redirects to Keycloak (GET /api/auth/signin/:id is unsupported). */
export const KEYCLOAK_SIGN_IN_ROUTE = "/auth/keycloak" as const;

export function keycloakSignInPath(callbackUrl: string): string {
  const params = new URLSearchParams({ callbackUrl });
  return `${KEYCLOAK_SIGN_IN_ROUTE}?${params}`;
}
