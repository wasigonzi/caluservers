// Stripe: cliente, verificación de firma, extracción de eventos y reembolsos.
// Firmas, ids y eventos son señuelos locales; la API real de Stripe no se toca.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { loader } from "./helpers/load.mjs";

const WEBHOOK_SECRET = "whsec_testsecret0123456789abcdef";
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
  subtotalCents: 1299,
  taxMode: "none",
  taxCents: 0,
  totalCents: 1299,
  status: "issued",
  payment: null,
  order: { planId: "plan-basico", planName: "Hosting Básico" },
};

/** Firma Stripe real (HMAC-SHA256) para un cuerpo dado. */
function signStripe(payload, secret = WEBHOOK_SECRET, secondsAgo = 0) {
  const ts = Math.floor(Date.now() / 1000) - secondsAgo;
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

/** lib/stripe.ts con el SDK REAL (firma de verdad) y la BD simulada. */
function realStripe(mocks = {}) {
  const state = { events: [], recorded: [], refunded: [] };
  const h = loader({
    "./db": {
      db: {
        plugin: { findUnique: async () => mocks.plugin ?? null },
        commerceEvent: {
          create: async (args) => {
            state.events.push(args.data);
            return args.data;
          },
        },
        customerInvoice: {
          findUnique: async () => (mocks.invoice === undefined ? INVOICE : mocks.invoice),
        },
      },
    },
    "./paypal-checkout": {
      payableInvoice: async () => INVOICE,
      siteOrigin: () => "https://caluservers.example",
    },
    "./commerce": {
      CommerceError,
      recordGatewayPayment: async (input) => {
        state.recorded.push(input);
        return { id: "pay_1", ...input };
      },
      markPaymentRefunded: async (input) => {
        state.refunded.push(input);
        return { id: "pay_1", status: "refunded" };
      },
    },
    env: {
      STRIPE_SECRET_KEY: mocks.apiKey === undefined ? API_KEY : mocks.apiKey,
      STRIPE_WEBHOOK_SECRET:
        mocks.webhookSecret === undefined ? WEBHOOK_SECRET : mocks.webhookSecret,
    },
  });
  return { module: h.load("lib/stripe.ts"), state };
}

/** lib/stripe.ts con un SDK FALSO (sin red) para crear sesiones y reembolsos. */
function fakeStripe(mocks = {}) {
  const state = { sessions: [], customers: [], subscriptions: [], refunds: [], events: [], products: [] };
  const fake = {
    products: {
      create: async (args) => {
        state.products.push(args);
        return { id: "prod_test_1" };
      },
    },
    checkout: {
      sessions: {
        create: async (args) => {
          state.sessions.push(args);
          return {
            id: "cs_test_0123456789abcdefghij",
            url: "https://checkout.stripe.com/pay/cs_test_0123456789abcdefghij",
          };
        },
        retrieve: async () => mocks.session ?? {
          id: "cs_test_0123456789abcdefghij",
          payment_status: "paid",
          payment_intent: "pi_test_0123456789abcdef",
          amount_total: 1299,
          currency: "usd",
          metadata: { invoice_id: "inv_1" },
        },
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
        state.subscriptions.push(args);
        return { id: "sub_test_1" };
      },
    },
    refunds: {
      create: async (params, opts) => {
        state.refunds.push({ params, opts });
        return { id: "re_test_1", status: "succeeded" };
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
        plugin: { findUnique: async () => mocks.plugin ?? null },
        commerceEvent: {
          create: async (args) => {
            state.events.push(args.data);
            return args.data;
          },
        },
        customerInvoice: {
          findUnique: async () => (mocks.invoice === undefined ? INVOICE : mocks.invoice),
        },
      },
    },
    "./paypal-checkout": {
      payableInvoice: async () => INVOICE,
      siteOrigin: () => "https://caluservers.example",
    },
    "./commerce": {
      CommerceError,
      recordGatewayPayment: async (input) => {
        state.recorded = state.recorded ?? [];
        state.recorded.push(input);
        return { id: "pay_1", ...input };
      },
      markPaymentRefunded: async (input) => {
        state.refunded = state.refunded ?? [];
        state.refunded.push(input);
        return { id: "pay_1", status: "refunded" };
      },
    },
    env: {
      STRIPE_SECRET_KEY: mocks.apiKey === undefined ? API_KEY : mocks.apiKey,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
  });
  return { module: h.load("lib/stripe.ts"), state };
}

test("sin clave Stripe no hay cliente: stripeReady() es falso", async () => {
  const { module } = realStripe({ apiKey: "" });
  assert.equal(await module.stripeReady(), false);
});

test("con clave de entorno hay cliente", async () => {
  const { module } = realStripe();
  assert.equal(await module.stripeReady(), true);
});

test("sin clave de entorno, el secreto sellado del plugin activo sí habilita Stripe", async () => {
  const { module } = realStripe({ apiKey: "" });
  // Se sella con el mismo secret-box real que usa el módulo.
  const h = loader({});
  const box = h.load("lib/secret-box.ts");
  const sealed = box.sealSecret("plugin:stripe:v1", API_KEY);
  const withPlugin = realStripe({
    apiKey: "",
    plugin: { key: "stripe", enabled: true, secretRef: sealed },
  });
  assert.equal(await withPlugin.module.stripeReady(), true);
  // Un plugin desactivado no habilita nada.
  const disabled = realStripe({
    apiKey: "",
    plugin: { key: "stripe", enabled: false, secretRef: sealed },
  });
  assert.equal(await disabled.module.stripeReady(), false);
  void module;
});

test("verifyWebhook acepta una firma HMAC real y devuelve el evento", async () => {
  const { module } = realStripe();
  const payload = JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed" });
  const event = await module.verifyWebhook(payload, signStripe(payload));
  assert.equal(event.id, "evt_test_1");
  assert.equal(event.type, "checkout.session.completed");
});

test("verifyWebhook rechaza una firma inválida sin registrar nada", async () => {
  const { module, state } = realStripe();
  const payload = JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed" });
  await assert.rejects(
    () => module.verifyWebhook(payload, signStripe(payload, "whsec_otro_secreto")),
    (error) => error.code === "signature",
  );
  await assert.rejects(
    () => module.verifyWebhook(payload, "t=1,v1=deadbeef"),
    (error) => error.code === "signature",
  );
  assert.equal(state.recorded.length, 0);
});

test("verifyWebhook sin secreto de webhook es 503 lógico (unconfigured)", async () => {
  const { module } = realStripe({ webhookSecret: "" });
  const payload = JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed" });
  await assert.rejects(
    () => module.verifyWebhook(payload, signStripe(payload)),
    (error) => error.code === "unconfigured",
  );
});

test("readStripePayment extrae el cobro de checkout.session.completed", () => {
  const { module } = realStripe();
  const payment = module.readStripePayment({
    type: "checkout.session.completed",
    data: {
      object: {
        amount_total: 1299,
        currency: "usd",
        payment_intent: "pi_test_0123456789abcdef",
        metadata: { invoice_id: "inv_1" },
      },
    },
  });
  assert.equal(payment.providerRef, "pi_test_0123456789abcdef");
  assert.equal(payment.amountCents, 1299);
  assert.equal(payment.currency, "USD");
  assert.equal(payment.invoiceId, "inv_1");
});

test("readStripePayment extrae el cobro de invoice.paid y sin factura devuelve null", () => {
  const { module } = realStripe();
  const payment = module.readStripePayment({
    type: "invoice.paid",
    data: {
      object: {
        id: "in_test_1",
        amount_paid: 1299,
        currency: "usd",
        metadata: { invoice_id: "inv_1" },
      },
    },
  });
  assert.equal(payment.providerRef, "in_test_1");
  assert.equal(payment.amountCents, 1299);
  const withoutInvoice = module.readStripePayment({
    type: "checkout.session.completed",
    data: {
      object: {
        amount_total: 1299,
        currency: "usd",
        payment_intent: "pi_test_0123456789abcdef",
        metadata: {},
      },
    },
  });
  assert.equal(withoutInvoice, null);
});

test("readStripeSubscription extrae suscripción y fallo de pago", () => {
  const { module } = realStripe();
  const deleted = module.readStripeSubscription({
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_test_1", status: "canceled" } },
  });
  assert.equal(deleted.gatewaySubscriptionId, "sub_test_1");
  assert.equal(deleted.status, "canceled");
  const failed = module.readStripeSubscription({
    type: "invoice.payment_failed",
    data: { object: { subscription: "sub_test_1" } },
  });
  assert.equal(failed.gatewaySubscriptionId, "sub_test_1");
  assert.equal(failed.status, "past_due");
});

test("startStripeCheckout crea la sesión con el importe de la factura", async () => {
  const { module, state } = fakeStripe();
  const result = await module.startStripeCheckout({ invoiceId: "inv_1", userId: "user_1" });
  assert.equal(result.sessionId, "cs_test_0123456789abcdefghij");
  assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
  const args = state.sessions[0];
  assert.equal(args.mode, "payment");
  assert.equal(args.line_items[0].price_data.unit_amount, 1299);
  assert.equal(args.line_items[0].price_data.currency, "usd");
  assert.equal(args.metadata.invoice_id, "inv_1");
  assert.match(args.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.equal(state.events[0].action, "payment.started");
});

test("startStripeCheckout sin clave no abre el cobro", async () => {
  const { module } = fakeStripe({ apiKey: "" });
  await assert.rejects(
    () => module.startStripeCheckout({ invoiceId: "inv_1", userId: "user_1" }),
    (error) => error.code === "unconfigured",
  );
});

test("finishStripeCheckout registra el cobro con el payment_intent", async () => {
  const { module, state } = fakeStripe();
  const result = await module.finishStripeCheckout({
    sessionId: "cs_test_0123456789abcdefghij",
    invoiceId: "inv_1",
    userId: "user_1",
  });
  assert.equal(result.paid, true);
  assert.equal(state.recorded[0].provider, "stripe");
  assert.equal(state.recorded[0].providerRef, "pi_test_0123456789abcdef");
  assert.equal(state.recorded[0].amountCents, 1299);
  assert.equal(state.recorded[0].source, "capture");
});

test("finishStripeCheckout rechaza una sesión no pagada o de otra factura", async () => {
  const unpaid = fakeStripe({
    session: {
      id: "cs_test_0123456789abcdefghij",
      payment_status: "unpaid",
      payment_intent: "pi_test_0123456789abcdef",
      amount_total: 1299,
      currency: "usd",
      metadata: { invoice_id: "inv_1" },
    },
  });
  await assert.rejects(
    () =>
      unpaid.module.finishStripeCheckout({
        sessionId: "cs_test_0123456789abcdefghij",
        invoiceId: "inv_1",
        userId: "user_1",
      }),
    (error) => error.code === "mismatch",
  );
  const otherInvoice = fakeStripe({
    session: {
      id: "cs_test_0123456789abcdefghij",
      payment_status: "paid",
      payment_intent: "pi_test_0123456789abcdef",
      amount_total: 1299,
      currency: "usd",
      metadata: { invoice_id: "inv_otra" },
    },
  });
  await assert.rejects(
    () =>
      otherInvoice.module.finishStripeCheckout({
        sessionId: "cs_test_0123456789abcdefghij",
        invoiceId: "inv_1",
        userId: "user_1",
      }),
    (error) => error.code === "mismatch",
  );
});

test("createBillingSubscription usa mes o año según el ciclo", async () => {
  const { module, state } = fakeStripe();
  const monthly = await module.createBillingSubscription({
    customer: { email: "cliente@example.com", name: "Ana" },
    priceCents: 1299,
    currency: "USD",
    cycle: "monthly",
  });
  assert.equal(monthly.subscriptionId, "sub_test_1");
  assert.equal(monthly.customerId, "cus_test_1");
  assert.equal(state.products[0].name, "CaluServers");
  assert.equal(state.subscriptions[0].items[0].price_data.product, "prod_test_1");
  assert.equal(state.subscriptions[0].items[0].price_data.recurring.interval, "month");
  assert.equal(state.subscriptions[0].items[0].price_data.unit_amount, 1299);
  await module.createBillingSubscription({
    customer: { email: "cliente@example.com", stripeCustomerId: "cus_test_1" },
    priceCents: 12900,
    currency: "USD",
    cycle: "yearly",
  });
  assert.equal(state.subscriptions[1].items[0].price_data.recurring.interval, "year");
  assert.equal(state.customers.length, 1);
});

test("refundPayment reembolsa el payment_intent con idempotencia y marca en BD", async () => {
  const { module, state } = fakeStripe();
  const result = await module.refundPayment(
    { id: "pay_1", providerRef: "pi_test_0123456789abcdef", amountCents: 1299, currency: "USD" },
    undefined,
    { actor: "admin@example.com", note: "Cliente duplicado, se devuelve el cobro." },
  );
  assert.equal(result.refundId, "re_test_1");
  assert.equal(result.payment.status, "refunded");
  assert.equal(state.refunds[0].params.payment_intent, "pi_test_0123456789abcdef");
  assert.equal(state.refunds[0].opts.idempotencyKey, "refund-pay_1");
  assert.equal(state.refunded[0].paymentId, "pay_1");
});

test("refundPayment rechaza referencia desconocida o importe mayor que el cobro", async () => {
  const { module, state } = fakeStripe();
  await assert.rejects(
    () =>
      module.refundPayment(
        { id: "pay_1", providerRef: "xyz_sin_sentido", amountCents: 1299, currency: "USD" },
        undefined,
        { actor: "admin@example.com", note: "Motivo de sobra." },
      ),
    (error) => error.code === "mismatch",
  );
  await assert.rejects(
    () =>
      module.refundPayment(
        { id: "pay_1", providerRef: "pi_test_0123456789abcdef", amountCents: 1299, currency: "USD" },
        99999,
        { actor: "admin@example.com", note: "Motivo de sobra." },
      ),
    (error) => error.code === "mismatch",
  );
  assert.equal(state.refunds.length, 0);
});

/* ------------------------- ruta /api/stripe/webhook ------------------------- */

import { NextRequest } from "next/server.js";

function stripeRoute(mocks = {}) {
  const state = { recorded: [], created: [], provisioned: [], subscriptions: [], events: [] };
  const seenRefs = new Set();
  class StripeError extends Error {
    constructor(code) {
      super(code);
      this.name = "StripeError";
      this.code = code;
    }
  }
  const h = loader({
    "@/lib/gateways": {
      handleGatewayWebhook: async () => {
        if (mocks.verifyError) throw new StripeError(mocks.verifyError);
        return mocks.event;
      },
    },
    "@/lib/commerce": {
      CommerceError,
      recordGatewayPayment: async (input) => {
        state.recorded.push(input);
        if (seenRefs.has(input.providerRef)) {
          return { id: "pay_1", providerRef: input.providerRef };
        }
        seenRefs.add(input.providerRef);
        state.created.push(input);
        return { id: "pay_1", providerRef: input.providerRef };
      },
    },
    "@/lib/stripe": {
      StripeError,
      // La ruta conecta la suscripción local con Stripe Billing tras el cobro.
      ensureStripeBillingSubscription: async (input) => {
        state.ensured = state.ensured ?? [];
        state.ensured.push(input);
        return { created: false, reason: "already-linked" };
      },
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async (input) => {
        state.provisioned.push(input);
        return { attempted: true, provisioned: true };
      },
    },
    "@/lib/db": {
      db: {
        subscription: {
          updateMany: async (args) => {
            state.subscriptions.push(args);
            return { count: 1 };
          },
        },
        commerceEvent: {
          create: async (args) => {
            state.events.push(args.data);
            return args.data;
          },
        },
      },
    },
  });
  return { api: h.load("app/api/stripe/webhook/route.ts"), state };
}

function stripeRequest(body, signature = "t=1,v1=firma") {
  return new NextRequest("https://caluservers.example/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const CHECKOUT_EVENT = {
  type: "payment",
  providerRef: "pi_test_0123456789abcdef",
  amountCents: 1299,
  currency: "USD",
  invoiceId: "inv_1",
};

test("webhook Stripe: firma inválida rechazada con 400 sin registrar pago", async () => {
  const { api, state } = stripeRoute({ verifyError: "signature", event: CHECKOUT_EVENT });
  const response = await api.POST(stripeRequest({}));
  assert.equal(response.status, 400);
  assert.equal(state.recorded.length, 0);
  assert.equal(state.provisioned.length, 0);
});

test("webhook Stripe: sin secreto de webhook responde 503 y no registra nada", async () => {
  const { api, state } = stripeRoute({ verifyError: "unconfigured", event: CHECKOUT_EVENT });
  const response = await api.POST(stripeRequest({}));
  assert.equal(response.status, 503);
  assert.equal(state.recorded.length, 0);
});

test("webhook Stripe: cobro verificado registra el pago y lanza el alta", async () => {
  const { api, state } = stripeRoute({ event: CHECKOUT_EVENT });
  const response = await api.POST(stripeRequest({}));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(state.recorded[0].provider, "stripe");
  assert.equal(state.recorded[0].providerRef, "pi_test_0123456789abcdef");
  assert.equal(state.recorded[0].amountCents, 1299);
  assert.equal(state.recorded[0].source, "webhook");
  assert.equal(state.provisioned[0].invoiceId, "inv_1");
  // Tras el cobro, la ruta conecta la suscripción local con Stripe Billing.
  assert.equal(state.ensured[0].invoiceId, "inv_1");
});

test("webhook Stripe: el mismo providerRef dos veces deja un solo cobro", async () => {
  const { api, state } = stripeRoute({ event: CHECKOUT_EVENT });
  const first = await api.POST(stripeRequest({}));
  const second = await api.POST(stripeRequest({}));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(state.recorded.length, 2);
  assert.equal(state.created.length, 1);
});

test("webhook Stripe: fallo de pago marca la suscripción past_due", async () => {
  const { api, state } = stripeRoute({
    event: { type: "payment_failed", gatewaySubscriptionId: "sub_test_1", invoiceId: "inv_1" },
  });
  const response = await api.POST(stripeRequest({}));
  assert.equal(response.status, 200);
  assert.equal(state.subscriptions[0].where.gatewaySubscriptionId, "sub_test_1");
  assert.equal(state.subscriptions[0].data.status, "past_due");
});

test("webhook Stripe: suscripción eliminada la marca cancelled", async () => {
  const { api, state } = stripeRoute({
    event: { type: "subscription_deleted", gatewaySubscriptionId: "sub_test_1" },
  });
  const response = await api.POST(stripeRequest({}));
  assert.equal(response.status, 200);
  assert.equal(state.subscriptions[0].data.status, "cancelled");
});

test("webhook Stripe: charge.refunded solo deja constancia, no reembolsa dos veces", async () => {
  const { api, state } = stripeRoute({
    event: {
      type: "refunded",
      providerRef: "ch_test_1",
      amountCents: 1299,
      currency: "USD",
    },
  });
  const response = await api.POST(stripeRequest({}));
  assert.equal(response.status, 200);
  assert.equal(state.recorded.length, 0);
  assert.equal(state.events[0].action, "payment.refunded");
  assert.match(state.events[0].details, /ch_test_1/);
});

test("webhook Stripe: evento que no mueve dinero se acepta sin registrar", async () => {
  const { api, state } = stripeRoute({
    event: { type: "ignored", gatewayType: "customer.created" },
  });
  const response = await api.POST(stripeRequest({}));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ignored, "customer.created");
  assert.equal(state.recorded.length, 0);
});

test("webhook Stripe: cuerpo vacío o gigante se rechaza", async () => {
  const { api } = stripeRoute({ event: CHECKOUT_EVENT });
  const empty = await api.POST(stripeRequest(""));
  assert.equal(empty.status, 400);
  const huge = await api.POST(stripeRequest({ padding: "x".repeat(300000) }));
  assert.equal(huge.status, 413);
});
