import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import authConfig from "@/auth.config";
import {
  clearAuthForceSignOut,
  markAuthForceSignOut,
  tokenRequiresSignOut,
} from "@/lib/auth-session";
import { isPrismaUnavailableError, runIfPrismaAvailable } from "@/lib/prisma-unavailable";
import {
  findUserById,
  findUserByKeycloakSub,
  syncUserWithDefaultStore,
  type AppUserAuthFields,
} from "@/lib/store";
import {
  redeemStoreMagicLinkToken,
  STORE_MAGIC_LINK_PROVIDER_ID,
} from "@/lib/sale-channel-magic-links";
import { touchKeycloakAppSession } from "@/lib/app-sessions";

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringClaim(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function decodeJwtPayload(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function keycloakSessionIdFromAuthPayload(profile: unknown, account: unknown) {
  const profileRecord = recordFromUnknown(profile);
  const accountRecord = recordFromUnknown(account);

  return (
    stringClaim(profileRecord, ["sid", "session_state"]) ??
    stringClaim(accountRecord, ["session_state"]) ??
    stringClaim(decodeJwtPayload(accountRecord?.id_token), ["sid", "session_state"]) ??
    stringClaim(decodeJwtPayload(accountRecord?.access_token), ["sid", "session_state"])
  );
}

async function currentRequestSessionMetadata() {
  try {
    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for");
    const ipAddress =
      forwardedFor?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip")?.trim() ||
      null;
    return {
      ipAddress,
      userAgent: headerStore.get("user-agent"),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

function applyAuthMetadataToSession(
  session: import("next-auth").Session,
  token: JWT,
) {
  session.authProvider = token.authProvider;
  session.keycloakSessionId =
    typeof token.keycloakSessionId === "string" ? token.keycloakSessionId : null;
  session.appSessionId = typeof token.appSessionId === "string" ? token.appSessionId : null;
}

function clearSessionUser(session: import("next-auth").Session) {
  delete (session as { user?: unknown }).user;
}

async function syncKeycloakAppSession(token: JWT, user: AppUserAuthFields, keycloakSub: string) {
  if (token.authProvider !== "keycloak") return;
  if (typeof token.appSessionId !== "string") {
    token.appSessionId = randomUUID();
  }

  const metadata = await currentRequestSessionMetadata();
  const result = await touchKeycloakAppSession({
    id: token.appSessionId,
    userId: user.id,
    keycloakSub,
    keycloakSessionId:
      typeof token.keycloakSessionId === "string" ? token.keycloakSessionId : null,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });

  if (result === "revoked") {
    markAuthForceSignOut(token);
  } else if (result === "unavailable") {
    console.warn("[auth] app session registry is unavailable; session revocation is skipped");
  }
}

function emailFromProfile(sub: string, profile: Record<string, unknown>) {
  const raw = profile.email;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return `${sub}@keycloak.local`;
}

function nameFromProfile(profile: Record<string, unknown>) {
  const name = profile.name;
  if (typeof name === "string" && name.length > 0) return name;
  const preferred = profile.preferred_username;
  if (typeof preferred === "string" && preferred.length > 0) return preferred;
  return null;
}

function realEmailFromProfile(profile: Record<string, unknown>): string | null {
  const raw = profile.email;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function realNameFromProfile(profile: Record<string, unknown>): string | null {
  const n = profile.name;
  if (typeof n === "string" && n.length > 0) return n;
  const p = profile.preferred_username;
  if (typeof p === "string" && p.length > 0) return p;
  return null;
}

function emailFromToken(sub: string, token: JWT) {
  if (typeof token.email === "string" && token.email.length > 0) return token.email;
  return `${sub}@keycloak.local`;
}

function nameFromToken(token: JWT) {
  return typeof token.name === "string" && token.name.length > 0 ? token.name : null;
}

function applyUserToToken(token: JWT, user: AppUserAuthFields) {
  token.appUserId = user.id;
  token.userType = user.type;
  token.saleChannelId = user.saleChannelId;
  token.saleChannelType = user.saleChannelType;

  if (token.realEmail === undefined) {
    token.realEmail = user.realEmail;
  }
  if (token.realName === undefined) {
    token.realName = user.realName;
  }
}

function applyUserToSessionUser(
  sessionUser: NonNullable<import("next-auth").Session["user"]>,
  user: AppUserAuthFields,
) {
  sessionUser.id = user.id;
  sessionUser.type = user.type;
  sessionUser.saleChannelId = user.saleChannelId;
  sessionUser.saleChannelType = user.saleChannelType;
}

async function lookupAppUserById(
  appUserId: string,
): Promise<"unavailable" | AppUserAuthFields | null> {
  const lookup = await findUserById(appUserId);
  if (!lookup.ok) return "unavailable";
  return lookup.value;
}

async function resolveKeycloakAppUser(
  sub: string,
  token: JWT,
  profileRecord?: Record<string, unknown>,
): Promise<"unavailable" | AppUserAuthFields> {
  const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;

  if (appUserId) {
    const byId = await lookupAppUserById(appUserId);
    if (byId === "unavailable") return "unavailable";
    if (byId) return byId;
    delete token.appUserId;
    console.warn("[auth] jwt appUserId was stale; resyncing user for keycloakSub", sub);
  }

  const bySub = await findUserByKeycloakSub(sub);
  if (!bySub.ok) return "unavailable";
  if (bySub.value) return bySub.value;

  const synced = await runIfPrismaAvailable(() =>
    syncUserWithDefaultStore({
      keycloakSub: sub,
      email: profileRecord ? emailFromProfile(sub, profileRecord) : emailFromToken(sub, token),
      name: profileRecord ? nameFromProfile(profileRecord) : nameFromToken(token),
      realEmail: token.realEmail ?? null,
      realName: token.realName ?? null,
    }),
  );
  if (!synced.ok) return "unavailable";
  return synced.value;
}

async function applyMagicLinkUserToToken(token: JWT, appUserId: string) {
  const row = await lookupAppUserById(appUserId);
  if (row === "unavailable") {
    markAuthForceSignOut(token);
    return;
  }
  if (row) {
    clearAuthForceSignOut(token);
    applyUserToToken(token, row);
    return;
  }
  markAuthForceSignOut(token);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(authConfig.providers ?? []),
    Credentials({
      id: STORE_MAGIC_LINK_PROVIDER_ID,
      name: "Store magic link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const rawToken = credentials.token;
        if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
          return null;
        }
        const user = await redeemStoreMagicLinkToken(rawToken);
        if (!user) return null;
        return {
          id: user.id,
          name: user.realName,
          email: user.realEmail,
          type: user.type,
          saleChannelId: user.saleChannelId,
          saleChannelType: user.saleChannelType,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "keycloak" || !profile || typeof profile.sub !== "string") {
        return true;
      }
      const sub = profile.sub;
      const profileRecord = profile as Record<string, unknown>;
      const email = emailFromProfile(sub, profileRecord);
      const name = nameFromProfile(profileRecord);

      try {
        const existingUser = await findUserByKeycloakSub(sub);
        if (!existingUser.ok) {
          console.warn(
            "[auth] signIn: database unavailable; Keycloak sign-in will complete without app user sync",
          );
          return true;
        }
        if (!existingUser.value) {
          const synced = await runIfPrismaAvailable(() =>
            syncUserWithDefaultStore({
              keycloakSub: sub,
              email,
              name,
              realEmail: realEmailFromProfile(profileRecord),
              realName: realNameFromProfile(profileRecord),
            }),
          );
          if (!synced.ok) {
            console.warn(
              "[auth] signIn: database unavailable; user will be signed out on first app request",
            );
          }
        }
        return true;
      } catch (err) {
        if (isPrismaUnavailableError(err)) {
          console.warn(
            "[auth] signIn: database unavailable; Keycloak sign-in will complete without app user sync",
          );
          return true;
        }
        throw err;
      }
    },
    async jwt({ token, account, profile, user }): Promise<JWT> {
      if (account?.provider === STORE_MAGIC_LINK_PROVIDER_ID) {
        token.authProvider = STORE_MAGIC_LINK_PROVIDER_ID;
        const appUserId = typeof user?.id === "string" ? user.id : null;
        if (appUserId) {
          await applyMagicLinkUserToToken(token, appUserId);
        }
        return token;
      }

      if (
        account?.provider !== "keycloak" &&
        token.authProvider === STORE_MAGIC_LINK_PROVIDER_ID
      ) {
        const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;
        if (appUserId) {
          await applyMagicLinkUserToToken(token, appUserId);
        }
        return token;
      }

      const sub =
        account?.provider === "keycloak" && profile && typeof profile.sub === "string"
          ? profile.sub
          : typeof token.sub === "string"
            ? token.sub
            : null;

      if (sub) {
        if (account?.provider === "keycloak") {
          token.authProvider = "keycloak";
          token.appSessionId = randomUUID();
          const keycloakSessionId = keycloakSessionIdFromAuthPayload(profile, account);
          if (keycloakSessionId) {
            token.keycloakSessionId = keycloakSessionId;
          } else {
            delete token.keycloakSessionId;
          }
        }
        const profileRecord =
          profile && typeof profile === "object"
            ? (profile as Record<string, unknown>)
            : undefined;

        if (profileRecord) {
          token.realEmail = realEmailFromProfile(profileRecord);
          token.realName = realNameFromProfile(profileRecord);
        } else {
          if (
            token.realEmail === undefined &&
            typeof token.email === "string" &&
            token.email.length > 0
          ) {
            token.realEmail = token.email;
          }
          if (
            token.realName === undefined &&
            typeof token.name === "string" &&
            token.name.length > 0
          ) {
            token.realName = token.name;
          }
        }

        try {
          const resolved = await resolveKeycloakAppUser(sub, token, profileRecord);
          if (resolved === "unavailable") {
            console.warn(
              "[auth] database unavailable during jwt refresh; forcing sign-out for keycloakSub",
              sub,
            );
            markAuthForceSignOut(token);
          } else {
            clearAuthForceSignOut(token);
            applyUserToToken(token, resolved);
            await syncKeycloakAppSession(token, resolved, sub);
          }
        } catch (err) {
          console.error("[auth] jwt user lookup failed for keycloakSub", sub, err);
          markAuthForceSignOut(token);
        }
      }
      return token;
    },
    async session({ session, token }) {
      applyAuthMetadataToSession(session, token);
      if (!session.user) return session;

      if (tokenRequiresSignOut(token)) {
        session.forceSignOut = true;
        clearSessionUser(session);
        return session;
      }

      const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;
      const sub = typeof token.sub === "string" ? token.sub : null;

      try {
        if (appUserId) {
          const byId = await lookupAppUserById(appUserId);
          if (byId === "unavailable") {
            markAuthForceSignOut(token);
            session.forceSignOut = true;
            return session;
          }
          if (byId) {
            applyUserToSessionUser(session.user, byId);
            return session;
          }
          delete token.appUserId;
          console.warn("[auth] session appUserId was stale; resyncing user for keycloakSub", sub);
        }

        if (sub) {
          const resolved = await resolveKeycloakAppUser(sub, token);
          if (resolved === "unavailable") {
            console.warn(
              "[auth] database unavailable during session refresh; forcing sign-out for keycloakSub",
              sub,
            );
            markAuthForceSignOut(token);
            session.forceSignOut = true;
            return session;
          }
          clearAuthForceSignOut(token);
          applyUserToToken(token, resolved);
          applyUserToSessionUser(session.user, resolved);
          return session;
        }
      } catch (err) {
        if (sub) {
          console.error("[auth] session user lookup failed for keycloakSub", sub, err);
        } else {
          console.error("[auth] session user lookup failed", err);
        }
        markAuthForceSignOut(token);
        session.forceSignOut = true;
        return session;
      }

      console.warn(
        "[auth] session without appUserId - API routes using createdById may fail",
      );
      session.user.type = "internal";
      session.user.saleChannelId = null;
      session.user.saleChannelType = null;
      return session;
    },
  },
});
