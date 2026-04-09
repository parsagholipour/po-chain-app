import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/prisma";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "keycloak" || !profile || typeof profile.sub !== "string") {
        return true;
      }
      const sub = profile.sub;
      const email = emailFromProfile(sub, profile as Record<string, unknown>);
      const name = nameFromProfile(profile as Record<string, unknown>);

      await prisma.user.upsert({
        where: { keycloakSub: sub },
        create: { keycloakSub: sub, email, name },
        update: { email, name },
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

        try {
          const row = await prisma.user.upsert({
            where: { keycloakSub: sub },
            create: { keycloakSub: sub, email, name },
            update: profileRecord
              ? {
                  email: emailFromProfile(sub, profileRecord),
                  name: nameFromProfile(profileRecord),
                }
              : {},
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