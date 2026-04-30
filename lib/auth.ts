import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import authConfig from "@/auth.config";
import { findUserByKeycloakSub, syncUserWithDefaultStore } from "@/lib/store";

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

function applyUserToToken(
  token: JWT,
  user: { id: string; realEmail: string | null; realName: string | null },
) {
  token.appUserId = user.id;

  if (token.realEmail === undefined) {
    token.realEmail = user.realEmail;
  }
  if (token.realName === undefined) {
    token.realName = user.realName;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

      await syncUserWithDefaultStore({
        keycloakSub: sub,
        email,
        name,
        realEmail: realEmailFromProfile(profileRecord),
        realName: realNameFromProfile(profileRecord),
      });

      return true;
    },
    async jwt({ token, account, profile }): Promise<JWT> {
      const sub =
        account?.provider === "keycloak" && profile && typeof profile.sub === "string"
          ? profile.sub
          : typeof token.sub === "string"
            ? token.sub
            : null;

      if (sub) {
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

        if (typeof token.appUserId === "string" && token.appUserId.length > 0) {
          return token;
        }

        try {
          const existingUser = await findUserByKeycloakSub(sub);

          if (existingUser) {
            applyUserToToken(token, existingUser);
          } else {
            const row = await syncUserWithDefaultStore({
              keycloakSub: sub,
              email: profileRecord ? emailFromProfile(sub, profileRecord) : emailFromToken(sub, token),
              name: profileRecord ? nameFromProfile(profileRecord) : nameFromToken(token),
              realEmail: token.realEmail ?? null,
              realName: token.realName ?? null,
            });

            token.appUserId = row.id;
          }
        } catch (err) {
          console.error("[auth] jwt user lookup failed for keycloakSub", sub, err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.appUserId) {
        session.user.id = token.appUserId as string;
      } else if (session.user) {
        console.warn(
          "[auth] session without appUserId — API routes using createdById may fail (sign in again)",
        );
      }
      return session;
    },
  },
});
