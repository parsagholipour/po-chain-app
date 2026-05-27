import { revokeAppSession } from "@/lib/app-sessions";
import { auth, signOut } from "@/lib/auth";
import {
  deleteKeycloakSession,
  KeycloakAdminConfigError,
  KeycloakAdminError,
} from "@/lib/keycloak-admin";

export const runtime = "nodejs";

const SIGNED_OUT_PATH = "/auth/signed-out";

function logBestEffortFailure(action: string, error: unknown) {
  if (error instanceof KeycloakAdminConfigError || error instanceof KeycloakAdminError) {
    console.warn(`[auth] sign-out: ${action} could not complete`, error.message);
    return;
  }

  console.warn(`[auth] sign-out: ${action} failed`, error);
}

async function revokeTrackedSessions() {
  const session = await auth();

  if (session?.appSessionId) {
    try {
      await revokeAppSession(session.appSessionId);
    } catch (error) {
      logBestEffortFailure("app session revoke", error);
    }
  }

  if (session?.authProvider === "keycloak" && session.keycloakSessionId) {
    try {
      await deleteKeycloakSession(session.keycloakSessionId);
    } catch (error) {
      logBestEffortFailure("Keycloak session revoke", error);
    }
  }
}

async function performSignOut() {
  await revokeTrackedSessions();
  await signOut({ redirectTo: SIGNED_OUT_PATH });
}

export async function POST() {
  await performSignOut();
}

export async function GET() {
  await performSignOut();
}
