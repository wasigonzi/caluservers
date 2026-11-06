-- CreateTable
CREATE TABLE "CatalogConfig" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogConfig_pkey" PRIMARY KEY ("id")
);
