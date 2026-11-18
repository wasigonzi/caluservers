// Conexión primer pago Stripe → suscripción de Stripe Billing (Fase 3, hueco de la Fase 2).
// Antes ningún flujo llamaba a createBillingSubscription, así que
// Subscription.gatewaySubscriptionId quedaba siempre vacío y el cron no
// podía cobrar renovaciones con el método guardado. El SDK de Stripe es
// falso (sin red) y la BD es simulada; la API real no se toca.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const API_KEY = "sk_test_51HxTestKey0123456789abcdef";

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CommerceError";
    this.status = status;
  }
}

const INVOICE = {
  id: "inv_1",
  userId: "user_1",
  orderId: "ord_1",
  number: "PF-0001",
  currency: "USD",
  totalCents: 1299,
  status: "paid",
  payment: { status: "confirmed", provider: "stripe" },
  order: { planId: "plan-basico", planName: "Hosting Básico" },
};

const SERVICE = { id: "svc_1", orderId: "ord_1", userId: "user_1" };

function subscription(overrides = {}) {
  return {
    id: "sub_1",
    serviceId: "svc_1",
    gatewayKey: "stripe",
    gatewaySubscriptionId: null,
    billingCycle: "monthly",
    priceCents: 1299,
    currency: "USD",
    ...overrides,
  };
}

function setup(mocks = {}) {
  const state = {
    subscriptions: [],
    customers: [],
    products: [],
    events: [],
    updated: [],
  };
  const fake = {
    products: {
      create: async (args) => {
        state.products.push(args);
        return { id: "prod_test_1" };
      },
    },
    customers: {
      create: async (args) => {
        state.customers.push(args);
        return { id: "cus_test_1" };
      },
    },
    subscriptions: {
      create: async (args) => {
        if (mocks.failSubscriptions) throw new Error("Stripe caído en la prueba");
        state.subscriptions.push(args);
        return { id: mocks.subscriptionId ?? "sub_test_1" };
      },
    },
    webhooks: { constructEvent: () => { throw new Error("sin firma real en el falso"); } },
  };
  class FakeStripe {
    constructor(key) {
      this.key = key;
      Object.assign(this, fake);
    }
  }
  const h = loader({
    stripe: FakeStripe,
    "./db": {
      db: {
        plugin: { findUnique: async () => null },
        commerceEvent: {
          create: async (args) => {
            state.events.push(args.data);
            return args.data;
          },
        },
        customerInvoice: {
          findUnique: async () => (mocks.invoice === undefined ? INVOICE : mocks.invoice),
        },
        customerService: {
          findFirst: async () => (mocks.service === undefined ? SERVICE : mocks.service),
        },
        subscription: {
          findUnique: async () =>
            mocks.subscription === undefined ? subscription() : mocks.subscription,
          updateMany: async (args) => {
            state.updated.push(args);
            return { count: mocks.updateCount ?? 1 };
          },
        },
        user: {
          findUnique: async () =>
            mocks.user === undefined
              ? { id: "user_1", name: "Ana", email: "cliente@example.com" }
              : mocks.user,
        },
      },
    },
    "./paypal-checkout": {
      payableInvoice: async () => INVOICE,
      siteOrigin: () => "https://caluservers.example",
    },
    "./commerce": {
      CommerceError,
      recordGatewayPayment: async (input) => ({ id: "pay_1", ...input }),
      markPaymentRefunded: async (input) => ({ id: "pay_1", status: "refunded" }),
    },
    env: { STRIPE_SECRET_KEY: API_KEY, STRIPE_WEBHOOK_SECRET: "whsec_test" },
  });
  return { module: h.load("lib/stripe.ts"), state };
}

test("stripeRecurringForCycle mapea los cuatro ciclos y yearly como alias", async () => {
  const { module } = setup();
  // Los objetos vienen de otro reino VM: se comparan campo a campo, no con deepEqual.
  const recurring = (cycle) => module.stripeRecurringForCycle(cycle);
  assert.equal(recurring("monthly").interval, "month");
  assert.equal(recurring("monthly").interval_count, 1);
  assert.equal(recurring("quarterly").interval, "month");
  assert.equal(recurring("quarterly").interval_count, 3);
  assert.equal(recurring("semiannual").interval, "month");
  assert.equal(recurring("semiannual").interval_count, 6);
  assert.equal(recurring("annual").interval, "year");
  assert.equal(recurring("annual").interval_count, 1);
  assert.equal(recurring("yearly").interval, "year");
  assert.equal(recurring("yearly").interval_count, 1);
  assert.throws(
    () => module.stripeRecurringForCycle("weekly"),
    (error) => error.code === "mismatch",
  );
});

test("createBillingSubscription usa interval_count 3 y 6 en quarterly y semiannual", async () => {
  const { module, state } = setup();
  await module.createBillingSubscription({
    customer: { email: "cliente@example.com" },
    priceCents: 1299,
    currency: "USD",
    cycle: "quarterly",
  });
  assert.equal(state.subscriptions[0].items[0].price_data.recurring.interval, "month");
  assert.equal(state.subscriptions[0].items[0].price_data.recurring.interval_count, 3);
  await module.createBillingSubscription({
    customer: { email: "cliente@example.com" },
    priceCents: 1299,
    currency: "USD",
    cycle: "semiannual",
  });
  assert.equal(state.subscriptions[1].items[0].price_data.recurring.interval, "month");
  assert.equal(state.subscriptions[1].items[0].price_data.recurring.interval_count, 6);
  await module.createBillingSubscription({
    customer: { email: "cliente@example.com" },
    priceCents: 1299,
    currency: "USD",
    cycle: "annual",
  });
  assert.equal(state.subscriptions[2].items[0].price_data.recurring.interval, "year");
  assert.equal(state.subscriptions[2].items[0].price_data.recurring.interval_count, 1);
});

test("ensureStripeBillingSubscription crea la suscripción y guarda su id", async () => {
  const { module, state } = setup();
  const result = await module.ensureStripeBillingSubscription({
    invoiceId: "inv_1",
    userId: "user_1",
  });
  assert.equal(result.created, true);
  assert.equal(result.gatewaySubscriptionId, "sub_test_1");
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].customer, "cus_test_1");
  assert.equal(state.updated.length, 1);
  assert.equal(state.updated[0].where.id, "sub_1");
  assert.equal(state.updated[0].where.gatewaySubscriptionId, null);
  assert.equal(state.updated[0].data.gatewaySubscriptionId, "sub_test_1");
  assert.equal(
    state.events.some((event) => event.action === "billing.stripe_subscription_created"),
    true,
  );
});

test("ensure no llama a Stripe si la suscripción ya tiene id", async () => {
  const { module, state } = setup({
    subscription: subscription({ gatewaySubscriptionId: "sub_ya_existe" }),
  });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "already-linked");
  assert.equal(result.gatewaySubscriptionId, "sub_ya_existe");
  assert.equal(state.subscriptions.length, 0);
  assert.equal(state.updated.length, 0);
});

test("ensure no actúa si el pago no fue con Stripe", async () => {
  const { module, state } = setup({
    invoice: { ...INVOICE, payment: { status: "confirmed", provider: "paypal" } },
  });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "not-stripe-payment");
  assert.equal(state.subscriptions.length, 0);
});

test("ensure no actúa si la suscripción local no es de Stripe", async () => {
  const { module, state } = setup({
    subscription: subscription({ gatewayKey: "paypal" }),
  });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "not-stripe-gateway");
  assert.equal(state.subscriptions.length, 0);
});

test("ensure no actúa con ciclo desconocido y deja constancia", async () => {
  const { module, state } = setup({
    subscription: subscription({ billingCycle: "weekly" }),
  });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "unsupported-cycle");
  assert.equal(state.subscriptions.length, 0);
  assert.equal(
    state.events.some((event) => event.action === "billing.stripe_subscription_failed"),
    true,
  );
});

test("ensure no tumba nada si Stripe falla: registra el fallo y no guarda id", async () => {
  const { module, state } = setup({ failSubscriptions: true });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "stripe-error");
  assert.equal(state.updated.length, 0);
  assert.equal(
    state.events.some((event) => event.action === "billing.stripe_subscription_failed"),
    true,
  );
});

test("ensure sin suscripción local no llama a Stripe", async () => {
  const { module, state } = setup({ subscription: null });
  const result = await module.ensureStripeBillingSubscription({ invoiceId: "inv_1" });
  assert.equal(result.created, false);
  assert.equal(result.reason, "no-subscription");
  assert.equal(state.subscriptions.length, 0);
});

test("ensure con userId ajeno no hace nada", async () => {
  const { module, state } = setup();
  const result = await module.ensureStripeBillingSubscription({
    invoiceId: "inv_1",
    userId: "user_otro",
  });
  assert.equal(result.created, false);
  assert.equal(result.reason, "not-found");
  assert.equal(state.subscriptions.length, 0);
});
