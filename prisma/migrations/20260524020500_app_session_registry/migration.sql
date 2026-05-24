CREATE TABLE "AppSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "keycloakSub" UUID NOT NULL,
    "keycloakSessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppSession_userId_revokedAt_lastSeenAt_idx" ON "AppSession"("userId", "revokedAt", "lastSeenAt");
CREATE INDEX "AppSession_keycloakSub_idx" ON "AppSession"("keycloakSub");
CREATE INDEX "AppSession_keycloakSessionId_idx" ON "AppSession"("keycloakSessionId");

ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
