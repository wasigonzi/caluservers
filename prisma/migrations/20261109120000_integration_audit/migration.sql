-- Upgrade for databases that already applied the first three migrations,
-- and the last step of a clean install. Do not edit those earlier files:
-- Prisma records their checksums.
-- IntegrationConfig stores WHM credentials. AdminAudit is the write journal.
-- A failed audit insert must roll back the content write (see lib/writes.ts).

CREATE TABLE IF NOT EXISTS "IntegrationConfig" (
    "id" TEXT NOT NULL DEFAULT 'whmcs',
    "endpoint" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatalogConfig" ALTER COLUMN "id" SET DEFAULT 'default';
