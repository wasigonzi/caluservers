-- PayPal sandbox checkout attempts. No live charges and no remote calls from this migration.

CREATE TABLE "PaypalCheckout" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paypalOrderId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "approveUrl" TEXT NOT NULL,
    "captureId" TEXT,
    "testFiscal" BOOLEAN NOT NULL DEFAULT false,
    "buyerApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaypalCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaypalCheckout_idempotencyKey_key" ON "PaypalCheckout"("idempotencyKey");
CREATE UNIQUE INDEX "PaypalCheckout_paypalOrderId_key" ON "PaypalCheckout"("paypalOrderId");
CREATE UNIQUE INDEX "PaypalCheckout_captureId_key" ON "PaypalCheckout"("captureId");
CREATE UNIQUE INDEX "PaypalCheckout_one_captured" ON "PaypalCheckout"("invoiceId") WHERE "status" = 'captured';
CREATE INDEX "PaypalCheckout_invoiceId_idx" ON "PaypalCheckout"("invoiceId");
CREATE INDEX "PaypalCheckout_userId_idx" ON "PaypalCheckout"("userId");

ALTER TABLE "PaypalCheckout" ADD CONSTRAINT "PaypalCheckout_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CustomerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaypalEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "transmissionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaypalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaypalEvent_eventId_key" ON "PaypalEvent"("eventId");
CREATE UNIQUE INDEX "PaypalEvent_transmissionId_key" ON "PaypalEvent"("transmissionId");
