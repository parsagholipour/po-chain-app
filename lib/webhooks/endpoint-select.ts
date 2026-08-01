import "server-only";

/** Shared between the endpoint list/detail routes. Never exposes the secret. */
export const webhookEndpointSelect = {
  id: true,
  url: true,
  description: true,
  events: true,
  enabled: true,
  secretLast4: true,
  consecutiveFailures: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  disabledAt: true,
  createdAt: true,
};
