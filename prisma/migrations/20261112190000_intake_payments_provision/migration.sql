-- Formularios propios (contacto y abuso), límite de peticiones públicas,
-- cobro por pasarela y alta automática en WHM.
-- Aditiva: no borra ni reescribe nada de las migraciones anteriores.

-- Límite compartido de peticiones públicas. La clave es un HMAC de ámbito + IP.
CREATE TABLE "RequestThrottle" (
    "id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestThrottle_pkey" PRIMARY KEY ("id")
);

-- Mensajes de contacto y de abuso recibidos por esta web.
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "target" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");
CREATE INDEX "ContactMessage_kind_createdAt_idx" ON "ContactMessage"("kind", "createdAt");

-- Alta automática en WHM: desactivada mientras no haya fila con enabled y paquete.
CREATE TABLE "ProvisionSetting" (
    "id" TEXT NOT NULL DEFAULT 'whm',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "packageName" TEXT NOT NULL DEFAULT '',
    "packageByPlan" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisionSetting_pkey" PRIMARY KEY ("id")
);

-- Dominio declarado por el cliente en el pedido. Nulo en los pedidos ya existentes.
ALTER TABLE "CustomerOrder" ADD COLUMN "domain" TEXT;

-- La tabla de cobros deja de ser solo manual. Las filas existentes quedan como "manual".
ALTER TABLE "ManualPayment" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ManualPayment" ADD COLUMN "providerRef" TEXT;
CREATE UNIQUE INDEX "ManualPayment_providerRef_key" ON "ManualPayment"("providerRef");

-- Resultado del alta en WHM por servicio.
ALTER TABLE "CustomerService" ADD COLUMN "cpanelUser" TEXT;
ALTER TABLE "CustomerService" ADD COLUMN "provisionedAt" TIMESTAMP(3);
ALTER TABLE "CustomerService" ADD COLUMN "provisionAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerService" ADD COLUMN "provisionError" TEXT;
CREATE UNIQUE INDEX "CustomerService_cpanelUser_key" ON "CustomerService"("cpanelUser");
