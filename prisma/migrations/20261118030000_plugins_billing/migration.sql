-- Fase 2: plugins, Stripe y facturación recurrente.
-- Modelos nuevos: Plugin, Subscription, Credit, PromoCode, BillingRun, TaxRule.
-- CustomerInvoice gana dueDate, subscriptionId, type, reminderSentAt,
-- dunningStage, periodStart, periodEnd (+ unicidad subscriptionId+periodStart
-- para que el cron nunca duplique una factura de renovación).
-- Aditiva: no toca datos existentes; las facturas viejas quedan type="initial".
-- Semilla: plugins conocidos desactivados (stripe, paypal, bank_transfer, whm);
-- las credenciales las pone el admin desde /admin/plugins o las variables
-- de entorno existentes (PayPal/WHM siguen como están).

CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "secretRef" TEXT,
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plugin_key_key" ON "Plugin"("key");
CREATE INDEX "Plugin_kind_enabled_idx" ON "Plugin"("kind", "enabled");

INSERT INTO "Plugin" ("id", "key", "kind", "label", "enabled", "updatedAt")
VALUES
  ('plugin_stripe', 'stripe', 'payment', 'Stripe', false, CURRENT_TIMESTAMP),
  ('plugin_paypal', 'paypal', 'payment', 'PayPal', false, CURRENT_TIMESTAMP),
  ('plugin_bank_transfer', 'bank_transfer', 'payment', 'Transferencia bancaria', false, CURRENT_TIMESTAMP),
  ('plugin_whm', 'whm', 'panel', 'WHM / cPanel', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "orderId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "nextInvoiceAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "gatewayKey" TEXT,
    "gatewaySubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_serviceId_key" ON "Subscription"("serviceId");
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");
CREATE INDEX "Subscription_status_nextInvoiceAt_idx" ON "Subscription"("status", "nextInvoiceAt");

CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Credit_userId_idx" ON "Credit"("userId");

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "appliesTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

CREATE TABLE "BillingRun" (
    "id" TEXT NOT NULL,
    "runDay" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,

    CONSTRAINT "BillingRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingRun_kind_runDay_key" ON "BillingRun"("kind", "runDay");

CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "appliesTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxRule_active_idx" ON "TaxRule"("active");

ALTER TABLE "CustomerInvoice" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN "subscriptionId" TEXT;
ALTER TABLE "CustomerInvoice" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE "CustomerInvoice" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN "dunningStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerInvoice" ADD COLUMN "periodStart" TIMESTAMP(3);
ALTER TABLE "CustomerInvoice" ADD COLUMN "periodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "CustomerInvoice_subscriptionId_periodStart_key" ON "CustomerInvoice"("subscriptionId", "periodStart");
CREATE INDEX "CustomerInvoice_userId_status_idx" ON "CustomerInvoice"("userId", "status");
CREATE INDEX "CustomerInvoice_subscriptionId_idx" ON "CustomerInvoice"("subscriptionId");
