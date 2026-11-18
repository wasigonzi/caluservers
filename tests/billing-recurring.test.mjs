// Facturación recurrente: ciclos, impuestos, crédito, promos y renovación.
// Datos y claves son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CommerceError";
    this.status = status;
  }
}

function recurring(mocks = {}) {
  const state = {
    events: [],
    creditsDeleted: [],
    creditsUpdated: [],
    invoicesCreated: [],
    ordersCreated: [],
    promoUpdates: [],
    subscriptionsCreated: [],
    subscriptionUpdates: [],
  };
  const tx = {
    subscription: {
      findUnique: async () => mocks.existingSubscription ?? null,
      create: async (args) => {
        state.subscriptionsCreated.push(args.data);
        return { id: "sub_1", ...args.data };
      },
      update: async (args) => {
        state.subscriptionUpdates.push(args);
        return args.data;
      },
    },
    credit: {
      findMany: async () =>
        (mocks.credits ?? []).filter(
          (credit) => !credit.expiresAt || credit.expiresAt > new Date(),
        ),
      delete: async (args) => {
        state.creditsDeleted.push(args.where.id);
        return {};
      },
      update: async (args) => {
        state.creditsUpdated.push(args);
        return args.data;
      },
    },
    promoCode: {
      updateMany: async (args) => {
        state.promoUpdates.push(args);
        return { count: mocks.promoUpdateCount ?? 1 };
      },
    },
    customerInvoice: {
      findUnique: async () => mocks.existingInvoice ?? null,
      create: async (args) => {
        state.invoicesCreated.push(args.data);
        return { id: "inv_r1", ...args.data };
      },
    },
    customerOrder: {
      findUnique: async () =>
        mocks.originalOrder ?? {
          id: "ord_1",
          planName: "Calu Starter",
          domain: "midominio.com",
        },
      create: async (args) => {
        state.ordersCreated.push(args.data);
        return { id: "ord_r1", ...args.data };
      },
    },
    commerceEvent: {
      create: async (args) => {
        state.events.push(args.data);
        return args.data;
      },
    },
  };
  const db = {
    ...tx,
    taxRule: { findMany: async () => mocks.taxRules ?? [] },
    promoCode: {
      findUnique: async ({ where }) => (mocks.promos ?? {})[where.code] ?? null,
    },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(tx),
  };
  const h = loader({ "./db": { db }, "./commerce": { CommerceError } });
  return { module: h.load("lib/billing-recurring.ts"), state, tx, db };
}

const SUBSCRIPTION = {
  id: "sub_abcdef12",
  userId: "user_1",
  orderId: "ord_1",
  planId: "wh0",
  billingCycle: "monthly",
  priceCents: 1299,
  currency: "USD",
};

test("billingCycleMonths: mensual 1, trimestral 3, semestral 6, anual 12", () => {
  const { module } = recurring();
  assert.equal(module.billingCycleMonths("monthly"), 1);
  assert.equal(module.billingCycleMonths("quarterly"), 3);
  assert.equal(module.billingCycleMonths("semiannual"), 6);
  assert.equal(module.billingCycleMonths("annual"), 12);
});

test("un ciclo desconocido es un error, no un mes adivinado", () => {
  const { module } = recurring();
  for (const cycle of ["weekly", "daily", "", "mensual"]) {
    assert.throws(
      () => module.billingCycleMonths(cycle),
      (error) => error.name === "CommerceError" && error.status === 400,
      cycle,
    );
  }
});

test("advanceInvoiceDate tiene tope a fin de mes", () => {
  const { module } = recurring();
  const atNoon = (iso) => new Date(`${iso}T12:00:00.000Z`);
  assert.equal(
    module.advanceInvoiceDate(atNoon("2026-01-31"), "monthly").toISOString().slice(0, 10),
    "2026-02-28",
  );
  assert.equal(
    module.advanceInvoiceDate(atNoon("2026-01-31"), "quarterly").toISOString().slice(0, 10),
    "2026-04-30",
  );
  assert.equal(
    module.advanceInvoiceDate(atNoon("2024-02-29"), "annual").toISOString().slice(0, 10),
    "2025-02-28",
  );
  assert.equal(
    module.advanceInvoiceDate(atNoon("2026-03-15"), "semiannual").toISOString().slice(0, 10),
    "2026-09-15",
  );
});

test("createSubscriptionForService es idempotente por servicio", async () => {
  const existing = { id: "sub_old", serviceId: "svc_1", billingCycle: "monthly" };
  const { module, state, tx } = recurring({ existingSubscription: existing });
  const found = await module.createSubscriptionForService(tx, {
    userId: "user_1",
    serviceId: "svc_1",
    orderId: "ord_1",
    planId: "wh0",
    priceCents: 1299,
    currency: "USD",
  });
  assert.equal(found, existing);
  assert.equal(state.subscriptionsCreated.length, 0);
});

test("createSubscriptionForService trimestral y anual avanzan nextInvoiceAt", async () => {
  const { module, state, tx } = recurring();
  const now = new Date();
  const quarterly = await module.createSubscriptionForService(tx, {
    userId: "user_1",
    serviceId: "svc_q",
    orderId: "ord_1",
    planId: "wh0",
    priceCents: 1299,
    currency: "USD",
    billingCycle: "quarterly",
  });
  assert.equal(quarterly.billingCycle, "quarterly");
  assert.equal(
    quarterly.nextInvoiceAt.getMonth(),
    (now.getMonth() + 3) % 12,
  );
  const annual = await module.createSubscriptionForService(tx, {
    userId: "user_1",
    serviceId: "svc_a",
    orderId: "ord_1",
    planId: "wh0",
    priceCents: 1299,
    currency: "USD",
    billingCycle: "annual",
  });
  assert.equal(annual.billingCycle, "annual");
  assert.equal(annual.nextInvoiceAt.getFullYear(), now.getFullYear() + 1);
  assert.equal(state.subscriptionsCreated.length, 2);
});

test("sin TaxRule activa el impuesto es 0 y taxMode none", async () => {
  const { module } = recurring({ taxRules: [] });
  const quote = await module.applyTaxCents(10000);
  assert.equal(quote.taxCents, 0);
  assert.equal(quote.taxMode, "none");
});

test("con TaxRule activa el impuesto se calcula con rateBps", async () => {
  const { module } = recurring({ taxRules: [{ rateBps: 1000 }] });
  const one = await module.applyTaxCents(10000);
  assert.equal(one.taxCents, 1000);
  assert.equal(one.taxMode, "tax");
  const rounded = await module.applyTaxCents(999);
  assert.equal(rounded.taxCents, 100);
  const two = recurring({ taxRules: [{ rateBps: 500 }, { rateBps: 250 }] });
  const both = await two.module.applyTaxCents(10000);
  assert.equal(both.taxCents, 750);
  assert.equal(both.taxMode, "tax");
});

test("applyCredits consume el más viejo primero y respeta el vencimiento", async () => {
  const past = new Date(Date.now() - 1000);
  const credits = [
    { id: "cr_vencido", amountCents: 9999, createdAt: new Date("2026-01-01"), expiresAt: past },
    { id: "cr_1", amountCents: 500, createdAt: new Date("2026-01-02"), expiresAt: null },
    { id: "cr_2", amountCents: 800, createdAt: new Date("2026-01-03"), expiresAt: null },
  ];
  const { module, state, tx } = recurring({ credits });
  const result = await module.applyCredits(tx, "user_1", 1000);
  assert.equal(result.appliedCents, 1000);
  assert.equal(result.creditsUsed.length, 2);
  assert.equal(result.creditsUsed[0].creditId, "cr_1");
  assert.equal(result.creditsUsed[0].appliedCents, 500);
  assert.equal(result.creditsUsed[1].creditId, "cr_2");
  assert.equal(result.creditsUsed[1].appliedCents, 500);
  assert.deepEqual(state.creditsDeleted, ["cr_1"]);
  assert.equal(state.creditsUpdated.length, 1);
  assert.equal(state.creditsUpdated[0].where.id, "cr_2");
  assert.equal(state.creditsUpdated[0].data.amountCents, 300);
});

test("applyCredits con importe 0 no toca nada", async () => {
  const { module, state, tx } = recurring({
    credits: [{ id: "cr_1", amountCents: 500, createdAt: new Date(), expiresAt: null }],
  });
  const result = await module.applyCredits(tx, "user_1", 0);
  assert.equal(result.appliedCents, 0);
  assert.equal(result.creditsUsed.length, 0);
  assert.equal(state.creditsDeleted.length, 0);
  assert.equal(state.creditsUpdated.length, 0);
});

const PROMO_PERCENT = {
  id: "promo_1",
  code: "LANZA20",
  kind: "percent",
  value: 20,
  maxUses: null,
  usedCount: 0,
  validFrom: null,
  validTo: null,
  appliesTo: null,
  active: true,
};

test("applyPromo percent y fixed, con tope en el subtotal", async () => {
  const { module } = recurring({
    promos: {
      LANZA20: PROMO_PERCENT,
      FIJO500: { ...PROMO_PERCENT, id: "promo_2", code: "FIJO500", kind: "fixed", value: 500 },
    },
  });
  // El código no distingue mayúsculas de minúsculas.
  assert.deepEqual((await module.applyPromo("lanza20", 10000)).discountCents, 2000);
  assert.deepEqual((await module.applyPromo("FIJO500", 300)).discountCents, 300);
  assert.deepEqual((await module.applyPromo("FIJO500", 10000)).discountCents, 500);
});

test("validatePromoCode rechaza caducado, agotado, inactivo y fuera de plan", async () => {
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 1000);
  const { module } = recurring({
    promos: {
      CADUCADO: { ...PROMO_PERCENT, code: "CADUCADO", validTo: past },
      AGOTADO: { ...PROMO_PERCENT, code: "AGOTADO", maxUses: 2, usedCount: 2 },
      INACTIVO: { ...PROMO_PERCENT, code: "INACTIVO", active: false },
      FUTURO: { ...PROMO_PERCENT, code: "FUTURO", validFrom: future },
      PLAN: { ...PROMO_PERCENT, code: "PLAN", appliesTo: "wh1" },
    },
  });
  for (const code of ["CADUCADO", "AGOTADO", "INACTIVO", "FUTURO"]) {
    await assert.rejects(
      module.validatePromoCode(code, "wh0", 10000),
      (error) => error.name === "CommerceError" && error.status === 409,
      code,
    );
  }
  await assert.rejects(
    module.validatePromoCode("PLAN", "wh0", 10000),
    (error) => error.name === "CommerceError" && error.status === 409,
  );
  await assert.rejects(
    module.validatePromoCode("NOEXISTE", "wh0", 10000),
    (error) => error.name === "CommerceError" && error.status === 404,
  );
  // Validar no gasta el uso: el mismo código sigue válido.
  const ok = await module.validatePromoCode("LANZA20", "wh0", 10000).catch(() => null);
  assert.equal(ok, null);
  const withPromo = recurring({ promos: { LANZA20: PROMO_PERCENT } });
  const promo = await withPromo.module.validatePromoCode("LANZA20", "wh0", 10000);
  assert.equal(promo.code, "LANZA20");
  assert.equal(withPromo.state.promoUpdates.length, 0);
});

test("createRenewalInvoice es idempotente por suscripción y periodo", async () => {
  const existing = { id: "inv_old", number: "RN-OLD" };
  const { module, state, tx } = recurring({ existingInvoice: existing });
  const found = await module.createRenewalInvoice(
    tx,
    SUBSCRIPTION,
    new Date("2026-02-01T00:00:00.000Z"),
  );
  assert.equal(found, existing);
  assert.equal(state.ordersCreated.length, 0);
  assert.equal(state.invoicesCreated.length, 0);
});

test("createRenewalInvoice congela crédito e impuesto, sin descuento de promo", async () => {
  const { module, state, tx } = recurring({
    credits: [{ id: "cr_1", amountCents: 300, createdAt: new Date("2026-01-01"), expiresAt: null }],
    taxRules: [{ rateBps: 1000 }],
  });
  const invoice = await module.createRenewalInvoice(
    tx,
    SUBSCRIPTION,
    new Date("2026-02-01T00:00:00.000Z"),
  );
  // Precio 1299 − crédito 300 = subtotal 999; impuesto 10% = 100; total 1099.
  assert.equal(invoice.subtotalCents, 999);
  assert.equal(invoice.taxCents, 100);
  assert.equal(invoice.taxMode, "tax");
  assert.equal(invoice.totalCents, 1099);
  assert.equal(invoice.type, "renewal");
  assert.equal(invoice.subscriptionId, SUBSCRIPTION.id);
  assert.match(invoice.number, /^RN-/);
  assert.equal(invoice.periodStart.toISOString().slice(0, 10), "2026-02-01");
  assert.equal(invoice.periodEnd.toISOString().slice(0, 10), "2026-03-01");
  assert.equal(invoice.dueDate.toISOString().slice(0, 10), "2026-03-01");
  const lines = invoice.lines.create;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].totalCents, 1299);
  assert.match(lines[0].description, /renovación/);
  assert.equal(lines[1].description, "Crédito aplicado");
  assert.equal(lines[1].totalCents, -300);
  assert.ok(!lines.some((line) => /Descuento/.test(line.description)));
  assert.equal(state.ordersCreated[0].totalCents, 1099);
  assert.equal(state.events[0].action, "billing.renewal_created");
});

test("createRenewalInvoice trimestral delimita el periodo en 3 meses", async () => {
  const { module, tx } = recurring();
  const invoice = await module.createRenewalInvoice(
    tx,
    { ...SUBSCRIPTION, billingCycle: "quarterly" },
    new Date("2026-01-15T00:00:00.000Z"),
  );
  assert.equal(invoice.periodEnd.toISOString().slice(0, 10), "2026-04-15");
  assert.equal(invoice.dueDate.toISOString().slice(0, 10), "2026-04-15");
});

/* ------------------- promo en el pedido inicial (lib/commerce.ts) ------------------- */

function commerceWithPromo(mocks = {}) {
  const state = {
    orders: [],
    invoices: [],
    events: [],
    promoUpdates: [],
    services: [],
    subscriptionUpdates: [],
  };
  const invoice = mocks.invoice ?? null;
  const tx = {
    customerOrder: {
      findUnique: async () => null,
      create: async (args) => {
        state.orders.push(args.data);
        return { id: "ord_abcdefgh", ...args.data };
      },
      update: async (args) => args.data,
    },
    customerInvoice: {
      findUnique: async () => invoice,
      create: async (args) => {
        state.invoices.push(args.data);
        return { id: "inv_1", ...args.data };
      },
      update: async (args) => args.data,
    },
    promoCode: {
      updateMany: async (args) => {
        state.promoUpdates.push(args);
        return { count: 1 };
      },
    },
    customerService: {
      create: async (args) => {
        state.services.push(args.data);
        return { id: "svc_1", ...args.data };
      },
    },
    subscription: {
      findUnique: async () => mocks.existingSubscription ?? null,
      update: async (args) => {
        state.subscriptionUpdates.push(args);
        return args.data;
      },
      create: async (args) => args.data,
    },
    commerceEvent: {
      create: async (args) => {
        state.events.push(args.data);
        return args.data;
      },
    },
    payment: { create: async (args) => ({ id: "pay_1", ...args.data }) },
  };
  const db = {
    ...tx,
    catalogConfig: { findUnique: async () => null },
    promoCode: {
      findUnique: async ({ where }) => (mocks.promos ?? {})[where.code] ?? null,
    },
    payment: { findUnique: async () => null },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(tx),
  };
  const h = loader({
    "./db": { db },
    env: { BILLING_CURRENCY: "USD", TAX_MODE: "none" },
  });
  return { module: h.load("lib/commerce.ts"), state };
}

test("createCustomerOrder con promo congela el descuento y gasta un uso", async () => {
  const { module, state } = commerceWithPromo({
    promos: { LANZA20: PROMO_PERCENT },
  });
  const order = await module.createCustomerOrder({
    userId: "user_1",
    planId: "wh0",
    idempotencyKey: "key-12345678",
    domain: "midominio.com",
    promoCode: "lanza20",
  });
  // Plan wh0: $3.99 = 399; 20% = 80 (79.8 redondeado); total 319.
  assert.equal(order.totalCents, 319);
  const orderLines = state.orders[0].lines.create;
  assert.equal(orderLines.length, 2);
  assert.equal(orderLines[0].totalCents, 399);
  assert.equal(orderLines[1].description, "Descuento LANZA20");
  assert.equal(orderLines[1].totalCents, -80);
  const invoice = state.invoices[0];
  assert.equal(invoice.subtotalCents, 319);
  assert.equal(invoice.totalCents, 319);
  assert.equal(invoice.taxMode, "none");
  assert.equal(invoice.lines.create.length, 2);
  assert.equal(invoice.lines.create[1].totalCents, -80);
  assert.equal(state.promoUpdates.length, 1);
  assert.equal(state.promoUpdates[0].data.usedCount.increment, 1);
  assert.match(state.events[0].details, /promo=LANZA20/);
});

test("createCustomerOrder con promo inválida no crea el pedido", async () => {
  const { module, state } = commerceWithPromo({ promos: {} });
  await assert.rejects(
    module.createCustomerOrder({
      userId: "user_1",
      planId: "wh0",
      idempotencyKey: "key-12345678",
      domain: "midominio.com",
      promoCode: "NOEXISTE",
    }),
    (error) => error.name === "CommerceError" && error.status === 404,
  );
  assert.equal(state.orders.length, 0);
  assert.equal(state.promoUpdates.length, 0);
});

test("el cobro de una renovación no crea otro servicio y avanza la suscripción", async () => {
  const renewalInvoice = {
    id: "inv_r1",
    userId: "user_1",
    orderId: "ord_r1",
    number: "RN-TEST",
    currency: "USD",
    subtotalCents: 1299,
    taxMode: "none",
    taxCents: 0,
    totalCents: 1299,
    status: "issued",
    type: "renewal",
    subscriptionId: "sub_1",
    payment: null,
    order: { planId: "wh0", planName: "Calu Starter" },
    lines: [],
  };
  const { module, state } = commerceWithPromo({
    invoice: renewalInvoice,
    existingSubscription: {
      id: "sub_1",
      nextInvoiceAt: new Date("2026-02-01T00:00:00.000Z"),
      billingCycle: "quarterly",
      status: "past_due",
    },
  });
  const payment = await module.recordGatewayPayment({
    invoiceId: "inv_r1",
    providerRef: "in_renew1",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
    provider: "stripe",
  });
  assert.equal(payment.provider, "stripe");
  assert.equal(state.services.length, 0);
  assert.equal(state.subscriptionUpdates.length, 1);
  assert.equal(state.subscriptionUpdates[0].data.status, "active");
  assert.equal(
    state.subscriptionUpdates[0].data.nextInvoiceAt.toISOString().slice(0, 10),
    "2026-05-01",
  );
});
