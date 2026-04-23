import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import authConfig from "@/auth.config";
import { syncUserWithDefaultStore } from "@/lib/store";

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

        const email = profileRecord
          ? emailFromProfile(sub, profileRecord)
          : `${sub}@keycloak.local`;
        const name = profileRecord ? nameFromProfile(profileRecord) : null;

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
          const row = await syncUserWithDefaultStore({
            keycloakSub: sub,
            email,
            name,
            realEmail: token.realEmail ?? null,
            realName: token.realName ?? null,
          });
          token.appUserId = row.id;
        } catch (err) {
          console.error("[auth] jwt user upsert failed for keycloakSub", sub, err);
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
