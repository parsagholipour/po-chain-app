import type { JWT } from "next-auth/jwt";

export const AUTH_FORCE_SIGN_OUT_CLAIM = "forceSignOut" as const;

export function markAuthForceSignOut(token: JWT) {
  token[AUTH_FORCE_SIGN_OUT_CLAIM] = true;
  delete token.appUserId;
  delete token.userType;
  delete token.saleChannelId;
  delete token.saleChannelType;
}

export function clearAuthForceSignOut(token: JWT) {
  delete token[AUTH_FORCE_SIGN_OUT_CLAIM];
}

export function tokenRequiresSignOut(token: JWT): boolean {
  return token[AUTH_FORCE_SIGN_OUT_CLAIM] === true;
}
