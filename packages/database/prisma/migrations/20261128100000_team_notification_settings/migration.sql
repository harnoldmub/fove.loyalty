-- Réglages des notifications internes à l'équipe FOVE (Admin > Système).
CREATE TABLE "TeamNotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partners" BOOLEAN NOT NULL DEFAULT true,
    "contact" BOOLEAN NOT NULL DEFAULT true,
    "digest" BOOLEAN NOT NULL DEFAULT true,
    "updatedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNotificationSettings_pkey" PRIMARY KEY ("id")
);
