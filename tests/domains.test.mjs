// Servicio de dominios: pedidos con precio congelado, pago → registro,
// reintentos, recordatorios y auto-renew con crédito. BD falsa en memoria;
// Porkbun, correo e impuestos son dobles controlables. Sin red real.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const TLDS = [".com", ".net", ".org", ".online", ".info", ".store"];

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CommerceError";
    this.status = status;
  }
}

class DomainQueryError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DomainQueryError";
    this.status = status;
  }
}

/** BD falsa: mapas por tabla con la forma de consulta que usa lib/domains.ts. */
function fakeDb() {
  let seq = 0;
  const id = (prefix) => `${prefix}_${++seq}`;
  const state = {
    tldPrices: new Map(),
    domains: new Map(), // por domain
    domainsById: new Map(),
    orders: new Map(), // por id
    ordersByKey: new Map(), // por idempotencyKey
    invoices: new Map(), // por id
    invoicesByOrder: new Map(), // por orderId
    payments: new Map(), // por invoiceId
    events: [],
    users: new Map(),
    credits: [],
    calls: { payments: [] },
  };

  const tldKey = (tld, registrarKey) => `${tld}|${registrarKey}`;

  const db = {
    state,
    tldPrice: {
      findUnique: async ({ where }) =>
        state.tldPrices.get(tldKey(where.tld_registrarKey.tld, where.tld_registrarKey.registrarKey)) ?? null,
      findMany: async ({ where = {} } = {}) => {
        const rows = [...state.tldPrices.values()];
        const filtered = where.active === undefined ? rows : rows.filter((row) => row.active === where.active);
        return filtered.sort((a, b) => (a.tld < b.tld ? -1 : 1));
      },
      create: async ({ data }) => {
        const row = { id: id("tld"), ...data };
        state.tldPrices.set(tldKey(data.tld, data.registrarKey), row);
        return row;
      },
      update: async ({ where, data }) => {
        const key = tldKey(where.tld_registrarKey.tld, where.tld_registrarKey.registrarKey);
        const row = state.tldPrices.get(key);
        if (!row) throw new Error("fila TldPrice no encontrada");
        Object.assign(row, data);
        return row;
      },
    },
    registeredDomain: {
      findUnique: async ({ where }) => {
        if (where.domain) return state.domains.get(where.domain) ?? null;
        if (where.id) return state.domainsById.get(where.id) ?? null;
        return null;
      },
      findMany: async ({ where = {} } = {}) => {
        let rows = [...state.domains.values()];
        if (where.status) rows = rows.filter((row) => row.status === where.status);
        if (where.expiresAt?.not === null) rows = rows.filter((row) => row.expiresAt !== null);
        return rows;
      },
      create: async ({ data }) => {
        const row = {
          id: id("dom"),
          createdAt: new Date(),
          updatedAt: new Date(),
          registryId: null,
          registeredAt: null,
          expiresAt: null,
          autoRenew: false,
          nameservers: null,
          locked: false,
          authCodeEncrypted: null,
          failureReason: null,
          orderId: null,
          ...data,
        };
        state.domains.set(row.domain, row);
        state.domainsById.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = where.domain
          ? state.domains.get(where.domain)
          : state.domainsById.get(where.id);
        if (!row) throw new Error("dominio no encontrado");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    customerOrder: {
      findUnique: async ({ where, include }) => {
        const order = where.id
          ? state.orders.get(where.id)
          : state.ordersByKey.get(where.idempotencyKey);
        if (!order) return null;
        if (!include?.invoice) return { ...order };
        const invoice = state.invoicesByOrder.get(order.id) ?? null;
        if (!invoice) return { ...order, invoice: null };
        if (include.invoice === true) {
          return { ...order, invoice: { ...invoice, payment: state.payments.get(invoice.id) ?? null } };
        }
        return {
          ...order,
          invoice: { ...invoice, payment: state.payments.get(invoice.id) ?? null },
        };
      },
      create: async ({ data }) => {
        const row = {
          id: id("ord"),
          createdAt: new Date(),
          status: "submitted",
          domain: null,
          lines: data.lines?.create ?? [],
          ...data,
          lines: data.lines?.create ?? [],
        };
        state.orders.set(row.id, row);
        state.ordersByKey.set(row.idempotencyKey, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.orders.get(where.id);
        if (!row) throw new Error("pedido no encontrado");
        Object.assign(row, data);
        return row;
      },
    },
    customerInvoice: {
      findUnique: async ({ where }) => state.invoices.get(where.id) ?? null,
      create: async ({ data }) => {
        const row = {
          id: id("inv"),
          createdAt: new Date(),
          status: "issued",
          dueDate: null,
          subscriptionId: null,
          type: "initial",
          reminderSentAt: null,
          dunningStage: 0,
          periodStart: null,
          periodEnd: null,
          lines: data.lines?.create ?? [],
          ...data,
          lines: data.lines?.create ?? [],
        };
        state.invoices.set(row.id, row);
        state.invoicesByOrder.set(row.orderId, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.invoices.get(where.id);
        if (!row) throw new Error("factura no encontrada");
        Object.assign(row, data);
        return row;
      },
    },
    commerceEvent: {
      create: async ({ data }) => {
        const row = { id: id("evt"), createdAt: new Date(), ...data };
        state.events.push(row);
        return row;
      },
      findFirst: async ({ where }) => {
        const needle = where.details?.contains ?? "";
        return (
          state.events.find(
            (event) =>
              event.action === where.action &&
              (where.entityId === undefined || event.entityId === where.entityId) &&
              event.details.includes(needle),
          ) ?? null
        );
      },
    },
    user: {
      findUnique: async ({ where }) => state.users.get(where.id) ?? null,
    },
    credit: {
      findMany: async ({ where = {} } = {}) =>
        state.credits.filter(
          (credit) =>
            (where.userId === undefined || credit.userId === where.userId) &&
            credit.amountCents > 0 &&
            (credit.expiresAt === null || credit.expiresAt === undefined || credit.expiresAt > new Date()),
        ),
    },
    payment: {
      create: async ({ data }) => {
        const row = { id: id("pay"), createdAt: new Date(), providerRef: null, ...data };
        state.payments.set(row.invoiceId, row);
        state.calls.payments.push(row);
        return row;
      },
    },
    $transaction: async (callback) => callback(db),
  };
  return db;
}

function seedTldPrice(db, tld, cents, active = true) {
  return db.tldPrice.create({
    data: {
      tld,
      registrarKey: "porkbun",
      registerCents: cents,
      renewCents: cents,
      transferCents: cents,
      currency: "USD",
      years: 1,
      active,
    },
  });
}

function seedUser(db, id, email, name = "Ana") {
  db.state.users.set(id, { id, name, email });
  return { id, name, email };
}

/** Carga lib/domains.ts con los dobles de cada prueba. */
function loadDomains(overrides = {}) {
  const db = fakeDb();
  const calls = { registrar: [], mail: [] };
  const policy = overrides.policy ?? { ok: true, currency: "USD", taxMode: "none" };
  const tax = overrides.tax ?? { taxCents: 0, taxMode: "none" };
  const registrarBehavior = overrides.registrar ?? {};
  const fakeRegistrar = {
    key: "porkbun",
    register: async (input) => {
      calls.registrar.push({ op: "register", ...input });
      if (registrarBehavior.register) return registrarBehavior.register(input);
      return { domain: input.domain, expiresAt: new Date("2027-11-18T00:00:00Z"), orderId: "PB-123" };
    },
    renew: async (domain, years) => {
      calls.registrar.push({ op: "renew", domain, years });
      if (registrarBehavior.renew) return registrarBehavior.renew(domain, years);
      return { domain, expiresAt: new Date("2027-11-18T00:00:00Z"), orderId: "PB-77" };
    },
    transfer: async (input) => {
      calls.registrar.push({ op: "transfer", ...input });
      if (registrarBehavior.transfer) return registrarBehavior.transfer(input);
      return { domain: input.domain, status: "pending_transfer" };
    },
    getPricing: async (tlds) => {
      calls.registrar.push({ op: "getPricing", tlds });
      if (registrarBehavior.getPricing) return registrarBehavior.getPricing(tlds);
      const e = new Error("Porkbun no está configurado.");
      e.code = "unconfigured";
      throw e;
    },
    checkAvailability: async () => ({ domain: "", available: false }),
    getDomain: async () => ({ domain: "", status: "unknown", expiresAt: null, autoRenew: false, nameservers: [] }),
    setAutoRenew: async () => {},
    setNameservers: async () => {},
    getAuthCode: async () => {
      throw new Error("no soportado");
    },
  };
  const h = loader({
    "./db": { db },
    "./commerce": {
      CommerceError,
      billingPolicy: () => ({ ...policy }),
      generateOrderTrackingToken: () => "a".repeat(48),
    },
    "./billing-recurring": {
      applyTaxCents: async () => ({ ...tax }),
      applyCredits: async (_tx, _userId, amountCents) =>
        overrides.applyCredits
          ? overrides.applyCredits(amountCents)
          : { appliedCents: amountCents, creditsUsed: [] },
    },
    "./porkbun": {
      getRegistrar: (key = "porkbun") => {
        if (key !== "porkbun") {
          const e = new Error("no soportado");
          e.code = "not-supported";
          throw e;
        }
        return fakeRegistrar;
      },
    },
    "./domain-lookup": {
      DomainQueryError,
      normalizeDomain: (raw) => {
        const domain = String(raw).trim().toLowerCase();
        const tld = TLDS.find((item) => domain.endsWith(item));
        if (!tld) throw new DomainQueryError("Extensión no soportada aquí.", 400);
        return { domain, tld };
      },
    },
    "./mailer": {
      deliverNotice: async (input) => {
        calls.mail.push(input);
        return overrides.mail ?? { delivered: true, reason: "sink" };
      },
    },
  });
  return { mod: h.load("lib/domains.ts"), db, calls };
}

async function confirmPayment(db, invoiceId) {
  const invoice = db.state.invoices.get(invoiceId);
  return db.payment.create({
    data: {
      invoiceId,
      currency: invoice.currency,
      amountCents: invoice.totalCents,
      status: "confirmed",
      note: "Cobro de prueba.",
      actor: "test",
      provider: "manual",
    },
  });
}

/* ------------------------------ precios ------------------------------ */

test("ensureTldPriceRows crea las 6 filas inactivas sin precio", async () => {
  const { mod, db } = loadDomains();
  const first = await mod.ensureTldPriceRows();
  assert.equal(first.created, 6);
  const second = await mod.ensureTldPriceRows();
  assert.equal(second.created, 0);
  const rows = await mod.listTldPrices(false);
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.active === false && row.registerCents === 0));
  assert.equal((await mod.listTldPrices(true)).length, 0);
});

test("getTldPrice y listTldPrices devuelven la fila activa", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  await seedTldPrice(db, ".net", 1100, false);
  const row = await mod.getTldPrice(".com");
  assert.equal(row.registerCents, 1299);
  assert.equal((await mod.listTldPrices(true)).length, 1);
  assert.equal((await mod.listTldPrices(false)).length, 2);
});

/* ------------------------------ pedidos ------------------------------ */

test("createDomainOrder congela el precio en factura aunque cambie TldPrice", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  seedUser(db, "user_1", "ana@example.com");
  const first = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
    idempotencyKey: "clave-pedido-001",
  });
  assert.equal(first.invoice.totalCents, 1299);
  assert.equal(first.invoice.status, "issued");
  assert.equal(first.planId, "domain");
  assert.equal(first.planName, "Dominio midominio.com");

  await db.tldPrice.update({
    where: { tld_registrarKey: { tld: ".com", registrarKey: "porkbun" } },
    data: { registerCents: 9999 },
  });
  const second = await mod.createDomainOrder({
    userId: "user_1",
    domain: "otro.com",
    kind: "register",
    idempotencyKey: "clave-pedido-002",
  });
  assert.equal(second.invoice.totalCents, 9999);
  const frozen = db.state.invoices.get(first.invoice.id);
  assert.equal(frozen.totalCents, 1299);
});

test("createDomainOrder es idempotente por clave", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  const first = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
    idempotencyKey: "clave-repetida-1",
  });
  const second = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
    idempotencyKey: "clave-repetida-1",
  });
  assert.equal(second.id, first.id);
  assert.equal(db.state.orders.size, 1);
  assert.equal(db.state.invoices.size, 1);
});

test("createDomainOrder: .pr y TLD sin fila activa van por registro asistido", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  await assert.rejects(
    () => mod.createDomainOrder({ userId: "user_1", domain: "midominio.pr", kind: "register" }),
    (error) => error instanceof CommerceError && error.status === 400 && /registro asistido/.test(error.message),
  );
  await assert.rejects(
    () => mod.createDomainOrder({ userId: "user_1", domain: "midominio.net", kind: "register" }),
    (error) => error instanceof CommerceError && error.status === 400 && /registro asistido/.test(error.message),
  );
  assert.equal(db.state.orders.size, 0);
});

test("createDomainOrder: sin TAX_MODE decidido y sin TaxRule, factura proforma", async () => {
  const { mod, db } = loadDomains({
    policy: { ok: false, error: "Impuesto sin decidir.", currency: "USD", taxMode: "unconfigured" },
    tax: { taxCents: 0, taxMode: "none" },
  });
  await seedTldPrice(db, ".com", 1299);
  const { invoice } = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
  });
  assert.equal(invoice.status, "proforma");
  assert.equal(invoice.taxMode, "unconfigured");
  assert.equal(invoice.taxCents, null);
  assert.equal(invoice.totalCents, 1299);
});

test("createDomainOrder de transferencia guarda el código EPP cifrado, no en claro", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "transfer",
    authCode: "EPP-999-SECRETO",
  });
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "pending");
  assert.match(row.authCodeEncrypted, /^v1:/);
  assert.doesNotMatch(row.authCodeEncrypted, /EPP-999-SECRETO/);
  await assert.rejects(
    () => mod.createDomainOrder({ userId: "user_1", domain: "otro.com", kind: "transfer" }),
    (error) => error instanceof CommerceError && error.status === 400,
  );
});

/* ------------------------------ tras el pago ------------------------------ */

test("afterDomainPayment sin pago confirmado no hace nada", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  const order = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
  });
  const result = await mod.afterDomainPayment(order.id);
  assert.equal(result.acted, false);
  assert.equal(result.reason, "sin-pago-confirmado");
  assert.equal(calls.registrar.length, 0);
  assert.equal(await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } }), null);
});

test("afterDomainPayment registra el dominio y guarda el orderId de Porkbun", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  seedUser(db, "user_1", "ana@example.com", "Ana");
  const created = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
  });
  await confirmPayment(db, created.invoice.id);
  const result = await mod.afterDomainPayment(created.id);
  assert.equal(result.acted, true);
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "active");
  assert.equal(row.registryId, "PB-123");
  assert.equal(row.expiresAt.toISOString().slice(0, 10), "2027-11-18");
  assert.equal(row.failureReason, null);
  assert.equal(calls.registrar[0].op, "register");
  assert.equal(calls.registrar[0].registrant.email, "ana@example.com");
  assert.ok(db.state.events.some((event) => event.action === "domain.registered"));
});

test("registro fallido queda pending con failureReason y el reintento lo activa", async () => {
  let attempts = 0;
  const { mod, db, calls } = loadDomains({
    registrar: {
      register: async (input) => {
        attempts += 1;
        if (attempts === 1) throw new Error("Porkbun no completó la operación.");
        return { domain: input.domain, expiresAt: new Date("2027-11-18T00:00:00Z"), orderId: "PB-124" };
      },
    },
  });
  await seedTldPrice(db, ".com", 1299);
  seedUser(db, "user_1", "ana@example.com");
  const created = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "register",
  });
  await confirmPayment(db, created.invoice.id);
  const failed = await mod.afterDomainPayment(created.id);
  assert.equal(failed.acted, false);
  assert.equal(failed.reason, "registro-fallido");
  let row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "pending");
  assert.match(row.failureReason, /Porkbun no completó/);
  assert.ok(db.state.events.some((event) => event.action === "domain.register_failed"));

  const retried = await mod.retryDomainRegistration(row.id, "admin@example.com");
  assert.equal(retried.acted, true);
  row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "active");
  assert.equal(row.registryId, "PB-124");
  assert.equal(calls.registrar.filter((call) => call.op === "register").length, 2);
});

test("afterDomainPayment de transferencia la deja pendiente y borra el código", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  seedUser(db, "user_1", "ana@example.com");
  const created = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "transfer",
    authCode: "EPP-999-SECRETO",
  });
  await confirmPayment(db, created.invoice.id);
  const result = await mod.afterDomainPayment(created.id);
  assert.equal(result.acted, true);
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "pending_transfer");
  assert.equal(row.authCodeEncrypted, null);
  assert.equal(calls.registrar[0].op, "transfer");
  assert.equal(calls.registrar[0].authCode, "EPP-999-SECRETO");
  assert.ok(db.state.events.some((event) => event.action === "domain.transfer_started"));
});

test("renovación antes de 30 días del registro no llama a Porkbun", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  seedUser(db, "user_1", "ana@example.com");
  await db.registeredDomain.create({
    data: {
      domain: "midominio.com",
      userId: "user_1",
      status: "active",
      registeredAt: new Date(Date.now() - 5 * 86_400_000),
      expiresAt: new Date("2027-11-18T00:00:00Z"),
    },
  });
  const created = await mod.createDomainOrder({
    userId: "user_1",
    domain: "midominio.com",
    kind: "renewal",
  });
  await confirmPayment(db, created.invoice.id);
  const result = await mod.afterDomainPayment(created.id);
  assert.equal(result.acted, false);
  assert.equal(result.reason, "renovacion-temprana");
  assert.equal(calls.registrar.filter((call) => call.op === "renew").length, 0);
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(row.status, "active");
  assert.match(row.failureReason, /30 días/);
});

/* ------------------------------ sync de precios ------------------------------ */

test("syncTldPrices sin credenciales no toca nada y conserva precios", async () => {
  const { mod, db } = loadDomains();
  await seedTldPrice(db, ".com", 1299);
  const result = await mod.syncTldPrices();
  assert.equal(result.skipped, true);
  assert.equal(result.updated, 0);
  const row = await mod.getTldPrice(".com");
  assert.equal(row.registerCents, 1299);
});

test("syncTldPrices actualiza y activa solo con los 3 precios", async () => {
  const { mod, db } = loadDomains({
    registrar: {
      getPricing: async () => ({
        prices: {
          ".com": { registerCents: 920, renewCents: 1050, transferCents: 920 },
          ".net": { registerCents: 0, renewCents: 1100, transferCents: 1100 },
        },
        unsupported: [".org"],
      }),
    },
  });
  await seedTldPrice(db, ".com", 1299);
  const result = await mod.syncTldPrices();
  assert.equal(result.skipped, false);
  assert.equal(result.updated, 2);
  assert.equal(result.failed, 4);
  const com = await mod.getTldPrice(".com");
  assert.equal(com.registerCents, 920);
  assert.equal(com.renewCents, 1050);
  assert.equal(com.active, true);
  const net = await mod.getTldPrice(".net");
  assert.equal(net.active, false);
  assert.equal(net.registerCents, 0);
});

/* ------------------------------ recordatorios ------------------------------ */

function seedExpiringDomain(db, daysLeft) {
  return db.registeredDomain.create({
    data: {
      domain: "midominio.com",
      userId: "user_1",
      status: "active",
      registeredAt: new Date("2025-11-18T00:00:00Z"),
      expiresAt: new Date(Date.now() + daysLeft * 86_400_000),
    },
  });
}

test("runDomainRenewalReminders avisa una vez por dominio y umbral", async () => {
  const now = new Date();
  const { mod, db, calls } = loadDomains();
  seedUser(db, "user_1", "ana@example.com");
  await seedExpiringDomain(db, 30);
  const first = await mod.runDomainRenewalReminders({ now });
  assert.equal(first.processed, 1);
  assert.equal(first.succeeded, 1);
  assert.equal(first.failed, 0);
  assert.equal(calls.mail.length, 1);
  assert.match(calls.mail[0].subject, /vence en 30 días/);
  const second = await mod.runDomainRenewalReminders({ now });
  assert.equal(second.succeeded, 0);
  assert.equal(calls.mail.length, 1);
});

test("runDomainRenewalReminders no avisa fuera de los umbrales ni cobra nada", async () => {
  const { mod, db, calls } = loadDomains();
  seedUser(db, "user_1", "ana@example.com");
  await seedExpiringDomain(db, 5);
  const stats = await mod.runDomainRenewalReminders({ now: new Date() });
  assert.equal(stats.processed, 0);
  assert.equal(calls.mail.length, 0);
  assert.equal(calls.registrar.length, 0);
});

test("recordatorio sin SMTP queda registrado y reintenta al día siguiente", async () => {
  const now = new Date();
  const { mod, db, calls } = loadDomains({
    mail: { delivered: false, reason: "unconfigured" },
  });
  seedUser(db, "user_1", "ana@example.com");
  await seedExpiringDomain(db, 30);
  const first = await mod.runDomainRenewalReminders({ now });
  assert.equal(first.succeeded, 0);
  assert.equal(first.failed, 1);
  const nextDay = new Date(now.getTime() + 86_400_000);
  const second = await mod.runDomainRenewalReminders({ now: nextDay });
  assert.equal(second.processed, 1);
  assert.equal(calls.mail.length, 2);
});

/* ------------------------------ auto-renew con crédito ------------------------------ */

test("tryAutoRenewWithCredit sin crédito no crea pedido ni llama al registrador", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1000);
  seedUser(db, "user_1", "ana@example.com");
  await db.registeredDomain.create({
    data: {
      domain: "midominio.com",
      userId: "user_1",
      status: "active",
      autoRenew: true,
      registeredAt: new Date("2025-11-18T00:00:00Z"),
      expiresAt: new Date("2026-12-18T00:00:00Z"),
    },
  });
  db.state.credits.push({ id: "cr_1", userId: "user_1", amountCents: 500, reason: "saldo", expiresAt: null });
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  const result = await mod.tryAutoRenewWithCredit(row);
  assert.equal(result.renewed, false);
  assert.equal(result.reason, "sin-credito");
  assert.equal(db.state.orders.size, 0);
  assert.equal(calls.registrar.length, 0);
});

test("tryAutoRenewWithCredit con crédito renueva, paga con crédito y actualiza el vencimiento", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1000);
  seedUser(db, "user_1", "ana@example.com");
  await db.registeredDomain.create({
    data: {
      domain: "midominio.com",
      userId: "user_1",
      status: "active",
      autoRenew: true,
      registeredAt: new Date("2025-11-18T00:00:00Z"),
      expiresAt: new Date("2026-12-18T00:00:00Z"),
    },
  });
  db.state.credits.push({ id: "cr_1", userId: "user_1", amountCents: 5000, reason: "saldo", expiresAt: null });
  const row = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  const result = await mod.tryAutoRenewWithCredit(row);
  assert.equal(result.renewed, true);
  assert.equal(calls.registrar[0].op, "renew");
  assert.equal(db.state.calls.payments.length, 1);
  assert.equal(db.state.calls.payments[0].provider, "credit");
  assert.equal(db.state.calls.payments[0].status, "confirmed");
  const updated = await db.registeredDomain.findUnique({ where: { domain: "midominio.com" } });
  assert.equal(updated.expiresAt.toISOString().slice(0, 10), "2027-11-18");
  assert.ok(db.state.events.some((event) => event.action === "domain.renewed"));
});

test("tryAutoRenewWithCredit con auto-renew desactivado no hace nada", async () => {
  const { mod, db, calls } = loadDomains();
  await seedTldPrice(db, ".com", 1000);
  const row = await db.registeredDomain.create({
    data: {
      domain: "midominio.com",
      userId: "user_1",
      status: "active",
      autoRenew: false,
      expiresAt: new Date("2026-12-18T00:00:00Z"),
    },
  });
  const result = await mod.tryAutoRenewWithCredit(row);
  assert.equal(result.renewed, false);
  assert.equal(result.reason, "auto-renew-desactivado");
  assert.equal(calls.registrar.length, 0);
});

/* ------------------------------ vista pública y nameservers ------------------------------ */

test("publicDomain real no devuelve el código cifrado ni secretos", async () => {
  const { mod } = loadDomains();
  const view = mod.publicDomain({
    id: "dom_A",
    domain: "midominio.com",
    registrarKey: "porkbun",
    status: "active",
    autoRenew: true,
    expiresAt: new Date("2027-01-15T00:00:00.000Z"),
    nameservers: ["ns1.ejemplo.test", 42, null],
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    failureReason: null,
    orderId: "ord_A",
    authCodeEncrypted: "secreto-cifrado-senuelo",
  });
  assert.equal(view.domain, "midominio.com");
  assert.equal("authCodeEncrypted" in view, false);
  assert.deepEqual([...view.nameservers], ["ns1.ejemplo.test"]);
  assert.equal(view.expiresAt, "2027-01-15T00:00:00.000Z");
  assert.equal(JSON.stringify(view).includes("secreto-cifrado"), false);
});

test("parseNameservers real normaliza, quita duplicados y rechaza lo inválido", async () => {
  const { mod } = loadDomains();
  assert.deepEqual([...mod.parseNameservers("NS1.Ejemplo.test, ns2.ejemplo.test, ns1.ejemplo.test")], [
    "ns1.ejemplo.test",
    "ns2.ejemplo.test",
  ]);
  assert.throws(() => mod.parseNameservers(["no es un host"]), (e) => e.status === 400);
  assert.throws(() => mod.parseNameservers([]), (e) => e.status === 400);
  assert.throws(
    () => mod.parseNameservers(Array.from({ length: 14 }, (_, i) => `ns${i}.ejemplo.test`)),
    (e) => e.status === 400,
  );
});
