import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

const source = process.env.DATABASE_URL || "";
if (process.env.CI && !source) throw new Error("DATABASE_URL es obligatorio en CI");
const root = path.resolve(import.meta.dirname, "..");

test("pedidos, aislamiento, importes y transiciones", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const name = "caluservers_commerce";
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
  process.env.DATABASE_URL = url.toString();
  process.env.BILLING_CURRENCY = "USD";
  delete process.env.TAX_MODE;
  const { formatMinorAmount } = await import("../lib/money.ts");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const commerce = await import("../lib/commerce.ts");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES
      ('user-a', 'Ana', 'ana@example.com', true, NOW(), NOW()),
      ('user-b', 'Bea', 'bea@example.com', true, NOW(), NOW())`);
    process.env.BILLING_CURRENCY = "";
    await assert.rejects(
      () => commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-cur-00001" }),
      (error) => error.status === 409 && !/3,99|\b399\b/.test(error.message),
    );
    process.env.BILLING_CURRENCY = "EUR";
    await assert.rejects(
      () => commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-cur-00002" }),
      (error) => error.status === 409 && !/3,99 EUR|399 EUR/.test(error.message),
    );
    process.env.BILLING_CURRENCY = "USD";
    const blocked = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-tax-0001" });
    assert.equal(blocked.invoice.taxMode, "unconfigured");
    assert.equal(blocked.invoice.status, "proforma");
    assert.match(blocked.invoice.number, /^PF-/);
    assert.equal(blocked.totalCents, 399);
    assert.equal(formatMinorAmount(blocked.totalCents, blocked.currency), "3,99 USD");
    await assert.rejects(
      () => commerce.confirmManualPayment({ actor: "admin@example.com", invoiceId: blocked.invoice.id, note: "cobro manual de prueba" }),
      (error) => error.status === 409 && /Puerto Rico/.test(error.message) && /proforma/i.test(error.message) && !/11[,.]5|IVU/i.test(error.message),
    );
    // Simula una declaración futura en el proceso de prueba. No es la política fiscal del propietario.
    process.env.TAX_MODE = "none";
    await assert.rejects(
      () => commerce.confirmManualPayment({ actor: "admin@example.com", invoiceId: blocked.invoice.id, note: "cobro manual de prueba" }),
      (error) => error.status === 409,
    );
    const stillProforma = await prisma.customerInvoice.findUnique({ where: { id: blocked.invoice.id } });
    assert.equal(stillProforma.status, "proforma");
    assert.equal(stillProforma.taxCents, null);
    const order = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pay-0001" });
    assert.equal(order.totalCents, 399);
    assert.equal(order.currency, "USD");
    assert.equal(order.invoice.status, "issued");
    assert.match(order.invoice.number, /^FA-/);
    assert.equal(formatMinorAmount(order.totalCents, order.currency), "3,99 USD");
    assert.notEqual(`${order.totalCents} ${order.currency}`, formatMinorAmount(order.totalCents, order.currency));
    const again = await commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-pay-0001" });
    assert.equal(again.id, order.id);
    await assert.rejects(
      () => commerce.createCustomerOrder({ userId: "user-a", planId: "wh1", idempotencyKey: "idem-pay-0001" }),
      (error) => error.status === 409,
    );
    const payment = await commerce.confirmManualPayment({ actor: "admin@example.com", invoiceId: order.invoice.id, note: "transferencia revisada" });
    const second = await commerce.confirmManualPayment({ actor: "admin@example.com", invoiceId: order.invoice.id, note: "transferencia revisada" });
    assert.equal(second.id, payment.id);
    const payments = await prisma.manualPayment.count({ where: { invoiceId: order.invoice.id } });
    assert.equal(payments, 1);
    const service = await prisma.customerService.findUnique({ where: { orderId: order.id } });
    assert.equal(service.status, "pending_provision");
    const active = await commerce.setServiceStatus({ actor: "admin@example.com", serviceId: service.id, status: "active", note: "alta manual en el panel" });
    assert.equal(active.status, "active");
    await assert.rejects(
      () => commerce.setServiceStatus({ actor: "admin@example.com", serviceId: service.id, status: "active", note: "otra alta no vale" }),
      (error) => error.status === 409,
    );
    const ticket = await commerce.createTicket({ userId: "user-a", subject: "Ayuda", body: "No veo el servicio." });
    await assert.rejects(
      () => commerce.replyTicket({ ticketId: ticket.id, userId: "user-b", author: "customer", body: "intruso" }),
      (error) => error.status === 403,
    );
    const reply = await commerce.replyTicket({ ticketId: ticket.id, author: "admin", body: "Revisado." });
    assert.ok(reply.id);
    await client.query(`ALTER TABLE "CustomerOrder" RENAME TO "CustomerOrder_off"`);
    await assert.rejects(() => commerce.createCustomerOrder({ userId: "user-a", planId: "wh0", idempotencyKey: "idem-down-0001" }));
    await client.query(`ALTER TABLE "CustomerOrder_off" RENAME TO "CustomerOrder"`);
  } finally {
    await client.end();
    await prisma.$disconnect();
    process.env.DATABASE_URL = source;
    const cleanup = new pg.Client({ connectionString: source });
    await cleanup.connect();
    await cleanup.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
    await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
    await cleanup.end();
  }
});
