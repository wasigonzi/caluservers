-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "lookupToken" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planCategory" TEXT NOT NULL DEFAULT 'web',
    "price" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "whmUsername" TEXT,
    "whmPackage" TEXT,
    "provisionAttempts" INTEGER NOT NULL DEFAULT 0,
    "provisionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingAccount" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "whmUsername" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "encryptedPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_lookupToken_key" ON "Order"("lookupToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_whmUsername_key" ON "Order"("whmUsername");

-- CreateIndex
CREATE INDEX "Order_customerEmail_createdAt_idx" ON "Order"("customerEmail", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HostingAccount_orderId_key" ON "HostingAccount"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "HostingAccount_whmUsername_key" ON "HostingAccount"("whmUsername");

-- AddForeignKey
ALTER TABLE "HostingAccount" ADD CONSTRAINT "HostingAccount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
