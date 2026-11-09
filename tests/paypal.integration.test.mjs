import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

const source = process.env.DATABASE_URL || "";
if (process.env.CI && !source) throw new Error("DATABASE_URL es obligatorio en CI");
const root = path.resolve(import.meta.dirname, "..");
const cert = "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-LOCAL";

test("paypal sandbox local: aislamiento, dobles, webhooks y fiscal de prueba", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const name = "caluservers_paypal";
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    BILLING_CURRENCY: process.env.BILLING_CURRENCY,
    TAX_MODE: process.env.TAX_MODE,
    PAYPAL_SANDBOX_FIXTURE: process.env.PAYPAL_SANDBOX_FIXTURE,
    PAYPAL_SANDBOX_TEST_FISCAL: process.env.PAYPAL_SANDBOX_TEST_FISCAL,
    PAYPAL_SANDBOX_WEBHOOK_ID: process.env.PAYPAL_SANDBOX_WEBHOOK_ID,
    PAYPAL_MODE: process.env.PAYPAL_MODE,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.DATABASE_URL = url.toString();
  process.env.BILLING_CURRENCY = "USD";
  delete process.env.TAX_MODE;
  process.env.PAYPAL_MODE = "sandbox";
  process.env.PAYPAL_SANDBOX_FIXTURE = "local";
  process.env.PAYPAL_SANDBOX_TEST_FISCAL = "isolated";
  process.env.PAYPAL_SANDBOX_WEBHOOK_ID = "wh-local-fixture";
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const commerce = await import("../lib/commerce.ts");
  const paypal = await import("../lib/paypal-checkout.ts");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES
      ('user-a', 'Ana', 'ana@example.com', true, NOW(), NOW()),
      ('user-b', 'Bea', 'bea@example.com', true, NOW(), NOW())`);
    const order = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pp-00001" });
    assert.equal(order.invoice.status, "proforma");
    assert.equal(order.totalCents, 399);
    await assert.rejects(
      () => paypal.createPaypalCheckout({ userId: "user-b", invoiceId: order.invoice.id, idempotencyKey: "idem-pp-ajena" }),
      (error) => error.status === 404,
    );
    const first = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: order.invoice.id, idempotencyKey: "idem-pp-same1" });
    const second = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: order.invoice.id, idempotencyKey: "idem-pp-same1" });
    assert.equal(second.paypalOrderId, first.paypalOrderId);
    assert.equal(first.amountCents, 399);
    assert.equal(first.testFiscal, true);
    assert.match(first.approveUrl, /^\/cuenta\/paypal\/simular/);
    await paypal.markFixtureApproval({ userId: "user-a", paypalOrderId: first.paypalOrderId, result: "approved" });
    const [paid, again] = await Promise.all([
      paypal.confirmPaypalCheckout({ userId: "user-a", paypalOrderId: first.paypalOrderId }),
      paypal.confirmPaypalCheckout({ userId: "user-a", paypalOrderId: first.paypalOrderId }),
    ]);
    assert.equal(paid.status, "captured");
    assert.equal(again.status, "captured");
    assert.equal(paid.captureId, again.captureId);
    const services = await prisma.customerService.count({ where: { orderId: order.id } });
    assert.equal(services, 1);
    const service = await prisma.customerService.findUnique({ where: { orderId: order.id } });
    assert.equal(service.status, "pending_provision");
    const still = await prisma.customerInvoice.findUnique({ where: { id: order.invoice.id } });
    assert.equal(still.status, "proforma");
    assert.equal(still.taxMode, "unconfigured");
    await assert.rejects(
      () => commerce.confirmManualPayment({ actor: "admin@example.com", invoiceId: order.invoice.id, note: "otro cobro no debe entrar" }),
      (error) => error.status === 409,
    );

    const other = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pp-00002" });
    const deniedCheckout = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: other.invoice.id, idempotencyKey: "idem-pp-denied" });
    await paypal.markFixtureApproval({ userId: "user-a", paypalOrderId: deniedCheckout.paypalOrderId, result: "denied" });
    const denied = await paypal.confirmPaypalCheckout({ userId: "user-a", paypalOrderId: deniedCheckout.paypalOrderId });
    assert.equal(denied.status, "denied");
    assert.equal(await prisma.customerService.count({ where: { orderId: other.id } }), 0);

    const pendingOrder = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pp-00003" });
    const pendingCheckout = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: pendingOrder.invoice.id, idempotencyKey: "idem-pp-pend" });
    const headers = {
      transmissionId: "tx-pending-1",
      transmissionSig: "fixture-valid",
      transmissionTime: "2026-11-09T00:00:00Z",
      authAlgo: "SHA256withRSA",
      certUrl: cert,
    };
    await paypal.ingestPaypalWebhook({
      ...headers,
      event: {
        id: "evt-pending-1",
        event_type: "PAYMENT.CAPTURE.PENDING",
        resource: { id: "CAP-PEND", supplementary_data: { related_ids: { order_id: pendingCheckout.paypalOrderId } } },
      },
    });
    assert.equal((await prisma.paypalCheckout.findUnique({ where: { id: pendingCheckout.id } })).status, "capture_pending");

    const mismatchOrder = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pp-00004" });
    const mismatchCheckout = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: mismatchOrder.invoice.id, idempotencyKey: "idem-pp-mis" });
    await paypal.ingestPaypalWebhook({
      ...headers,
      transmissionId: "tx-mismatch-1",
      event: {
        id: "evt-mismatch-1",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-BAD",
          custom_id: mismatchCheckout.invoiceId,
          amount: { currency_code: "USD", value: "399.00" },
          supplementary_data: { related_ids: { order_id: mismatchCheckout.paypalOrderId } },
        },
      },
    });
    assert.notEqual((await prisma.paypalCheckout.findUnique({ where: { id: mismatchCheckout.id } })).status, "captured");

    const lateOrder = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pp-00005" });
    const lateCheckout = await paypal.createPaypalCheckout({ userId: "user-a", invoiceId: lateOrder.invoice.id, idempotencyKey: "idem-pp-late" });
    const completed = {
      id: "evt-complete-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAP-LATE",
        custom_id: lateCheckout.invoiceId,
        amount: { currency_code: "USD", value: "3.99" },
        supplementary_data: { related_ids: { order_id: lateCheckout.paypalOrderId } },
      },
    };
    await paypal.ingestPaypalWebhook({ ...headers, transmissionId: "tx-complete-1", event: completed });
    await paypal.ingestPaypalWebhook({ ...headers, transmissionId: "tx-complete-1", event: completed });
    await paypal.ingestPaypalWebhook({
      ...headers,
      transmissionId: "tx-approved-after",
      event: {
        id: "evt-approved-after",
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: {
          id: lateCheckout.paypalOrderId,
          purchase_units: [{ custom_id: lateCheckout.invoiceId, amount: { currency_code: "USD", value: "3.99" } }],
        },
      },
    });
    const late = await prisma.paypalCheckout.findUnique({ where: { id: lateCheckout.id } });
    assert.equal(late.status, "captured");
    assert.equal(await prisma.customerService.count({ where: { orderId: lateOrder.id } }), 1);
    assert.equal(await prisma.customerService.findUnique({ where: { orderId: lateOrder.id } }).then((row) => row.status), "pending_provision");

    const before = await prisma.paypalCheckout.findUnique({ where: { id: pendingCheckout.id } });
    await assert.rejects(
      () => paypal.ingestPaypalWebhook({ ...headers, transmissionId: "tx-bad-sig", transmissionSig: "no", event: { id: "evt-bad", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} } }),
      (error) => error.status === 401,
    );
    assert.equal((await prisma.paypalCheckout.findUnique({ where: { id: pendingCheckout.id } })).status, before.status);

    await client.query(`ALTER TABLE "PaypalCheckout" RENAME TO "PaypalCheckout_off"`);
    await assert.rejects(() => paypal.createPaypalCheckout({ userId: "user-a", invoiceId: order.invoice.id, idempotencyKey: "idem-pp-down1" }));
    await client.query(`ALTER TABLE "PaypalCheckout_off" RENAME TO "PaypalCheckout"`);
  } finally {
    await client.end();
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const cleanup = new pg.Client({ connectionString: source });
    await cleanup.connect();
    await cleanup.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
    await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
    await cleanup.end();
  }
});
