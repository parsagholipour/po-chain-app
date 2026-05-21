import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import authConfig from "@/auth.config";
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

async function syncUserForToken(
  sub: string,
  token: JWT,
  profileRecord?: Record<string, unknown>,
) {
  const existingUser = await findUserByKeycloakSub(sub);
  if (existingUser) return existingUser;

  return syncUserWithDefaultStore({
    keycloakSub: sub,
    email: profileRecord ? emailFromProfile(sub, profileRecord) : emailFromToken(sub, token),
    name: profileRecord ? nameFromProfile(profileRecord) : nameFromToken(token),
    realEmail: token.realEmail ?? null,
    realName: token.realName ?? null,
  });
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

      const existingUser = await findUserByKeycloakSub(sub);
      if (!existingUser) {
        await syncUserWithDefaultStore({
          keycloakSub: sub,
          email,
          name,
          realEmail: realEmailFromProfile(profileRecord),
          realName: realNameFromProfile(profileRecord),
        });
      }

      return true;
    },
    async jwt({ token, account, profile, user }): Promise<JWT> {
      if (account?.provider === STORE_MAGIC_LINK_PROVIDER_ID) {
        token.authProvider = STORE_MAGIC_LINK_PROVIDER_ID;
        const appUserId = typeof user?.id === "string" ? user.id : null;
        if (appUserId) {
          const row = await findUserById(appUserId);
          if (row) {
            applyUserToToken(token, row);
          }
        }
        return token;
      }

      if (
        account?.provider !== "keycloak" &&
        token.authProvider === STORE_MAGIC_LINK_PROVIDER_ID
      ) {
        const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;
        if (appUserId) {
          const row = await findUserById(appUserId);
          if (row) {
            applyUserToToken(token, row);
          }
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
        }
        const profileRecord =
          profile && typeof profile === "object"
            ? (profile as Record<string, unknown>)
            : undefined;

        if (profileRecord) {
          token.realEmail = realEmailFromProfile(profileRecord);
          token.realName = realNameFromProfile(profileRecord);
        } else {
          if (token.realEmail === undefined && typeof token.email === "string" && token.email.length > 0) {
            token.realEmail = token.email;
          }
          if (token.realName === undefined && typeof token.name === "string" && token.name.length > 0) {
            token.realName = token.name;
          }
        }

        try {
          const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;
          const existingTokenUser = appUserId ? await findUserById(appUserId) : null;

        if (existingTokenUser) {
          applyUserToToken(token, existingTokenUser);
        } else {
            if (appUserId) {
              delete token.appUserId;
              console.warn("[auth] jwt appUserId was stale; resyncing user for keycloakSub", sub);
            }
          const row = await syncUserForToken(sub, token, profileRecord);
          applyUserToToken(token, row);
        }
      } catch (err) {
          console.error("[auth] jwt user lookup failed for keycloakSub", sub, err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      const appUserId = typeof token.appUserId === "string" ? token.appUserId : null;
      const sub = typeof token.sub === "string" ? token.sub : null;

      try {
        const existingTokenUser = appUserId ? await findUserById(appUserId) : null;
        if (existingTokenUser) {
          applyUserToToken(token, existingTokenUser);
          session.user.id = existingTokenUser.id;
          session.user.type = existingTokenUser.type;
          session.user.saleChannelId = existingTokenUser.saleChannelId;
          session.user.saleChannelType = existingTokenUser.saleChannelType;
          return session;
        }

        if (appUserId) {
          delete token.appUserId;
          console.warn("[auth] session appUserId was stale; resyncing user for keycloakSub", sub);
        }

        if (sub) {
          const row = await syncUserForToken(sub, token);
          applyUserToToken(token, row);
          session.user.id = row.id;
          session.user.type = row.type;
          session.user.saleChannelId = row.saleChannelId;
          session.user.saleChannelType = row.saleChannelType;
          return session;
        }
      } catch (err) {
        if (sub) {
          console.error("[auth] session user lookup failed for keycloakSub", sub, err);
        } else {
          console.error("[auth] session user lookup failed", err);
        }
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
