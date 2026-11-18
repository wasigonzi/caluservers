// Pasarelas: listado, inicio de cobro por pasarela, transferencia y reembolsos.
// Todos los ids, claves y eventos son señuelos locales; no se llama a ninguna API real.
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

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status;
  }
  async json() {
    return this.body;
  }
}

const nextServer = {
  NextResponse: class {
    static json(data, init) {
      return new FakeResponse(data, init?.status ?? 200);
    }
  },
  NextRequest: class {},
};

function fakeReq(body) {
  return { json: async () => body, headers: { get: () => null } };
}

/* --------------------------- lib/gateways.ts --------------------------- */

function gateways(mocks = {}) {
  const state = { started: [] };
  const h = loader({
    "./commerce": { CommerceError },
    "./billing-settings": {
      paymentInstructions: async () => mocks.instructions ?? "Banco Ejemplo · ES00 0000 0000 0000",
    },
    "./paypal": { paypalReady: () => mocks.paypalReady ?? false },
    "./paypal-checkout": {
      payableInvoice: async () => ({
        id: "inv_1",
        number: "PF-0001",
        totalCents: 1299,
        currency: "USD",
      }),
      startPaypalCheckout: async (input) => {
        state.started.push({ gateway: "paypal", ...input });
        return { orderId: "pp-order-1", approveUrl: "https://paypal.example/approve", invoiceId: input.invoiceId };
      },
    },
    "./stripe": {
      stripeReady: async () => mocks.stripeReady ?? false,
      startStripeCheckout: async (input) => {
        state.started.push({ gateway: "stripe", ...input });
        return { sessionId: "cs_test_1", url: "https://checkout.stripe.com/pay/1", invoiceId: input.invoiceId };
      },
      verifyWebhook: async (raw) => JSON.parse(raw),
      readStripePayment: (event) => event._payment ?? null,
      readStripeSubscription: (event) => event._sub ?? null,
    },
  });
  return { module: h.load("lib/gateways.ts"), state };
}

test("availableGateways lista cada pasarela con su estado real", async () => {
  const { module } = gateways({ paypalReady: true, stripeReady: false });
  const list = await module.availableGateways();
  // Comparación por JSON: los objetos vienen del contexto VM y deepEqual
  // rechaza prototipos distintos aunque la estructura sea idéntica.
  assert.equal(
    JSON.stringify(list.map((item) => [item.key, item.online, item.ready])),
    JSON.stringify([
      ["paypal", true, true],
      ["stripe", true, false],
      ["bank_transfer", false, true],
    ]),
  );
});

test("startCheckout abre PayPal y Stripe por su propia vía", async () => {
  const { module, state } = gateways({ paypalReady: true, stripeReady: true });
  const paypal = await module.startCheckout({ gatewayKey: "paypal", invoiceId: "inv_1", userId: "user_1" });
  assert.equal(paypal.approveUrl, "https://paypal.example/approve");
  const stripe = await module.startCheckout({ gatewayKey: "stripe", invoiceId: "inv_1", userId: "user_1" });
  assert.equal(stripe.url, "https://checkout.stripe.com/pay/1");
  assert.deepEqual(
    state.started.map((item) => item.gateway),
    ["paypal", "stripe"],
  );
});

test("startCheckout con pasarela desactivada o sin credenciales responde 503", async () => {
  const { module } = gateways({ paypalReady: false, stripeReady: false });
  await assert.rejects(
    () => module.startCheckout({ gatewayKey: "stripe", invoiceId: "inv_1", userId: "user_1" }),
    (error) => error.status === 503,
  );
  await assert.rejects(
    () => module.startCheckout({ gatewayKey: "paypal", invoiceId: "inv_1", userId: "user_1" }),
    (error) => error.status === 503,
  );
  await assert.rejects(
    () => module.startCheckout({ gatewayKey: "otra", invoiceId: "inv_1", userId: "user_1" }),
    (error) => error.status === 400,
  );
});

test("la transferencia deja el pedido pendiente con las instrucciones", async () => {
  const { module } = gateways();
  const result = await module.startCheckout({
    gatewayKey: "bank_transfer",
    invoiceId: "inv_1",
    userId: "user_1",
  });
  assert.equal(result.pending, true);
  assert.equal(result.invoiceNumber, "PF-0001");
  assert.match(result.instructions, /Banco Ejemplo/);
});

test("handleGatewayWebhook normaliza pago, fallo y baja de suscripción", async () => {
  const { module } = gateways();
  const payment = await module.handleGatewayWebhook({
    gatewayKey: "stripe",
    rawBody: JSON.stringify({
      type: "checkout.session.completed",
      _payment: {
        providerRef: "pi_test_1",
        amountCents: 1299,
        currency: "USD",
        invoiceId: "inv_1",
      },
    }),
    headers: { get: () => "t=1,v1=firma" },
  });
  assert.equal(payment.type, "payment");
  assert.equal(payment.providerRef, "pi_test_1");
  const failed = await module.handleGatewayWebhook({
    gatewayKey: "stripe",
    rawBody: JSON.stringify({
      type: "invoice.payment_failed",
      _sub: { gatewaySubscriptionId: "sub_test_1", status: "past_due" },
    }),
    headers: { get: () => "t=1,v1=firma" },
  });
  assert.equal(failed.type, "payment_failed");
  assert.equal(failed.gatewaySubscriptionId, "sub_test_1");
  const deleted = await module.handleGatewayWebhook({
    gatewayKey: "stripe",
    rawBody: JSON.stringify({
      type: "customer.subscription.deleted",
      _sub: { gatewaySubscriptionId: "sub_test_1", status: "canceled" },
    }),
    headers: { get: () => "t=1,v1=firma" },
  });
  assert.equal(deleted.type, "subscription_deleted");
  const ignored = await module.handleGatewayWebhook({
    gatewayKey: "stripe",
    rawBody: JSON.stringify({ type: "customer.created" }),
    headers: { get: () => "t=1,v1=firma" },
  });
  assert.equal(ignored.type, "ignored");
});

test("handleGatewayWebhook rechaza una pasarela sin webhook genérico", async () => {
  const { module } = gateways();
  await assert.rejects(
    () =>
      module.handleGatewayWebhook({
        gatewayKey: "paypal",
        rawBody: "{}",
        headers: { get: () => "x" },
      }),
    (error) => error.status === 400,
  );
});

/* ----------------- generalización de lib/commerce.ts ----------------- */

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

function commerce() {
  const state = { payments: [], services: [], subscriptions: [], events: [] };
  const tx = {
    customerInvoice: {
      findUnique: async () => ({ ...INVOICE }),
      update: async (args) => args.data,
    },
    payment: {
      findUnique: async ({ where }) =>
        state.payments.find(
          (item) =>
            (where.providerRef !== undefined && item.providerRef === where.providerRef) ||
            (where.id !== undefined && item.id === where.id),
        ) ?? null,
      create: async (args) => {
        state.payments.push({ id: `pay_${state.payments.length + 1}`, ...args.data });
        return state.payments[state.payments.length - 1];
      },
      update: async (args) => {
        const found = state.payments.find((item) => item.id === args.where.id);
        Object.assign(found, args.data);
        return found;
      },
    },
    customerOrder: { update: async (args) => args.data },
    customerService: {
      create: async (args) => {
        const service = { id: "svc_1", ...args.data };
        state.services.push(service);
        return service;
      },
    },
    subscription: {
      findUnique: async () => null,
      create: async (args) => {
        const sub = { id: "sub_1", ...args.data };
        state.subscriptions.push(sub);
        return sub;
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
    catalogConfig: { findUnique: async () => null },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(tx),
  };
  const h = loader({
    "./db": { db },
    env: { BILLING_CURRENCY: "USD", TAX_MODE: "none" },
  });
  return { module: h.load("lib/commerce.ts"), state };
}

test("el mismo providerRef de Stripe dos veces deja un solo cobro", async () => {
  const { module, state } = commerce();
  const first = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    provider: "stripe",
    providerRef: "pi_test_0123456789abcdef",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
  });
  const second = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    provider: "stripe",
    providerRef: "pi_test_0123456789abcdef",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
  });
  assert.equal(first.id, second.id);
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].provider, "stripe");
  assert.equal(state.services.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].gatewayKey, "stripe");
});

test("la confirmación manual por transferencia cobra con provider bank_transfer", async () => {
  const { module, state } = commerce();
  const payment = await module.confirmManualPayment({
    actor: "admin@example.com",
    invoiceId: "inv_1",
    note: "Transferencia recibida, referencia PF-0001.",
    provider: "bank_transfer",
  });
  assert.equal(payment.provider, "bank_transfer");
  assert.equal(payment.status, "confirmed");
  assert.match(payment.note, /Transferencia recibida/);
  assert.equal(state.subscriptions[0].gatewayKey, "bank_transfer");
  // Sin provider, sigue siendo manual como antes.
  const second = commerce();
  const manual = await second.module.confirmManualPayment({
    actor: "admin@example.com",
    invoiceId: "inv_1",
    note: "Cobro en efectivo en oficina.",
  });
  assert.equal(manual.provider, "manual");
  assert.equal(second.state.subscriptions[0].gatewayKey, null);
});

test("markPaymentRefunded marca el cobro y deja evento, sin borrar nada", async () => {
  const { module, state } = commerce();
  const payment = await module.confirmManualPayment({
    actor: "admin@example.com",
    invoiceId: "inv_1",
    note: "Transferencia recibida, referencia PF-0001.",
    provider: "bank_transfer",
  });
  const refunded = await module.markPaymentRefunded({
    actor: "admin@example.com",
    paymentId: payment.id,
    note: "El cliente canceló antes del alta.",
  });
  assert.equal(refunded.status, "refunded");
  assert.equal(state.events.at(-1).action, "payment.refunded");
  await assert.rejects(
    () =>
      module.markPaymentRefunded({
        actor: "admin@example.com",
        paymentId: payment.id,
        note: "Otra vez el mismo motivo.",
      }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    () =>
      module.markPaymentRefunded({
        actor: "admin@example.com",
        paymentId: "pay_no_existe",
        note: "Motivo de sobra.",
      }),
    (error) => error.status === 404,
  );
});

/* ---------------------- ruta /api/account/checkout ---------------------- */

function checkoutRoute(mocks = {}) {
  const state = { provisions: [] };
  class StripeError extends Error {
    constructor(code) {
      super(code);
      this.name = "StripeError";
      this.code = code;
    }
  }
  class PaypalError extends Error {
    constructor(code) {
      super(code);
      this.name = "PaypalError";
      this.code = code;
    }
  }
  const h = loader({
    "@/lib/customer-session": {
      customerSession: async () =>
        "session" in mocks ? mocks.session : { user: { id: "user_1" } },
    },
    "@/lib/gateways": {
      availableGateways: async () => mocks.gateways ?? [],
      startCheckout: async (input) => mocks.started ?? { gatewayKey: input.gatewayKey },
    },
    "@/lib/stripe": {
      StripeError,
      finishStripeCheckout: async () => mocks.captured ?? { paid: true, paymentId: "pay_1", invoiceId: "inv_1" },
    },
    "@/lib/paypal": { PaypalError },
    "@/lib/commerce": { CommerceError },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/whm-provision": {
      maybeAutoProvision: async (input) => {
        state.provisions.push(input);
        return { provisioned: false, reason: "test" };
      },
    },
    "next/server": nextServer,
  });
  return { route: h.load("app/api/account/checkout/route.ts"), state };
}

test("checkout: lista de pasarelas y apertura por Stripe", async () => {
  const { route } = checkoutRoute({
    gateways: [
      { key: "paypal", label: "PayPal", online: true, ready: true },
      { key: "stripe", label: "Stripe", online: true, ready: false },
      { key: "bank_transfer", label: "Transferencia bancaria", online: false, ready: true },
    ],
    started: { gatewayKey: "stripe", sessionId: "cs_test_1", url: "https://checkout.stripe.com/pay/1" },
  });
  const list = await route.POST(fakeReq({ action: "gateways", invoiceId: "inv_1" }));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).gateways.length, 3);
  const start = await route.POST(
    fakeReq({ action: "start", gateway: "stripe", invoiceId: "inv_1" }),
  );
  assert.equal(start.status, 200);
  assert.equal((await start.json()).url, "https://checkout.stripe.com/pay/1");
});

test("checkout: sin sesión exige entrar (401)", async () => {
  const { route } = checkoutRoute({ session: null });
  const res = await route.POST(fakeReq({ action: "gateways", invoiceId: "inv_1" }));
  assert.equal(res.status, 401);
});

test("checkout: la vuelta de Stripe confirma el cobro", async () => {
  const { route, state } = checkoutRoute();
  const res = await route.POST(
    fakeReq({ action: "capture", gateway: "stripe", invoiceId: "inv_1", sessionId: "cs_test_1" }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).paid, true);
  assert.equal(state.provisions[0].invoiceId, "inv_1");
});

/* ------------------- admin: acción refund-payment ------------------- */

function adminRoute(mocks = {}) {
  const state = { refunds: [], marked: [] };
  class AuthorizationError extends Error {
    constructor() {
      super("forbidden");
      this.name = "AuthorizationError";
    }
  }
  class StripeError extends Error {
    constructor(code) {
      super(code);
      this.name = "StripeError";
      this.code = code;
    }
  }
  const allowed = mocks.permissions ?? ["payments:confirm"];
  const h = loader({
    "@/lib/auth": {
      AuthorizationError,
      requireAdmin: async () => ({ email: "admin@example.com" }),
      requirePermission: async (permission) => {
        if (!allowed.includes(permission)) throw new AuthorizationError();
        // Step-up reciente: estas pruebas cubren el reembolso en sí, no el
        // step-up (ver tests/stepup.test.mjs para el 403).
        return { email: "admin@example.com", stepUpAt: new Date() };
      },
    },
    "@/lib/commerce": {
      CommerceError,
      confirmManualPayment: async () => ({ id: "pay_1" }),
      markPaymentRefunded: async (input) => {
        state.marked.push(input);
        return { id: "pay_1", status: "refunded" };
      },
      replyTicket: async () => ({ id: "msg_1" }),
      setServiceStatus: async () => ({ id: "svc_1", status: "active" }),
      setTicketStatus: async () => ({ id: "t_1", status: "closed" }),
      voidInvoice: async () => ({ id: "inv_1", status: "void" }),
    },
    "@/lib/stripe": {
      StripeError,
      refundPayment: async (payment) => {
        state.refunds.push(payment);
        return { refundId: "re_test_1", payment: { id: payment.id, status: "refunded" } };
      },
    },
    "@/lib/db": {
      db: {
        payment: {
          findUnique: async () => mocks.payment ?? null,
        },
        contactMessage: {
          findUnique: async () => ({ id: "msg-1" }),
          update: async ({ data }) => ({ id: "msg-1", status: data.status }),
        },
      },
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/whm-security": {
      WhmError: class WhmError extends Error {},
      safeWhmError: () => ({ message: "whm", code: "x" }),
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async () => ({ provisioned: false }),
      ProvisionError: class ProvisionError extends Error {},
      provisionService: async () => ({}),
      suspendServiceAccount: async () => ({ attempted: false, suspended: false, reason: "" }),
    },
    "next/server": nextServer,
  });
  return { route: h.load("app/api/admin/commerce/route.ts"), state };
}

const STRIPE_PAYMENT = {
  id: "pay_1",
  invoiceId: "inv_1",
  amountCents: 1299,
  currency: "USD",
  status: "confirmed",
  provider: "stripe",
  providerRef: "pi_test_0123456789abcdef",
};

test("reembolso sin permiso payments:confirm responde 403", async () => {
  const { route, state } = adminRoute({ permissions: [], payment: STRIPE_PAYMENT });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "Motivo de sobra." }),
  );
  assert.equal(res.status, 403);
  assert.equal(state.refunds.length, 0);
  assert.equal(state.marked.length, 0);
});

test("reembolso con nota corta responde 400", async () => {
  const { route } = adminRoute({ payment: STRIPE_PAYMENT });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "corto" }),
  );
  assert.equal(res.status, 400);
});

test("reembolso de PayPal responde 501 honesto, sin inventar la API", async () => {
  const { route, state } = adminRoute({
    payment: { ...STRIPE_PAYMENT, provider: "paypal", providerRef: "CAP1" },
  });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "El cliente lo pidió." }),
  );
  assert.equal(res.status, 501);
  assert.match((await res.json()).error, /hazlo en PayPal/);
  assert.equal(state.refunds.length, 0);
});

test("reembolso de Stripe llama a la pasarela y marca en BD", async () => {
  const { route, state } = adminRoute({ payment: STRIPE_PAYMENT });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "El cliente canceló el pedido." }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "refunded");
  assert.equal(body.refundId, "re_test_1");
  assert.equal(state.refunds[0].providerRef, "pi_test_0123456789abcdef");
});

test("reembolso manual o por transferencia solo marca en BD", async () => {
  const { route, state } = adminRoute({
    payment: { ...STRIPE_PAYMENT, provider: "bank_transfer", providerRef: null },
  });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "Se devolvió por transferencia." }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "refunded");
  assert.equal(state.refunds.length, 0);
  assert.equal(state.marked[0].paymentId, "pay_1");
});

test("reembolso de cobro inexistente o ya reembolsado se rechaza", async () => {
  const missing = adminRoute({ payment: null });
  const res404 = await missing.route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_no", note: "Motivo de sobra." }),
  );
  assert.equal(res404.status, 404);
  const done = adminRoute({ payment: { ...STRIPE_PAYMENT, status: "refunded" } });
  const res409 = await done.route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay_1", note: "Motivo de sobra." }),
  );
  assert.equal(res409.status, 409);
});
