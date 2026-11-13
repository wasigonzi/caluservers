// Webhook de PayPal. Firmas, ids y eventos son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { loader } from "./helpers/load.mjs";

const SIG_HEADERS = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "tid",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-12T00:00:00Z",
};

const CAPTURE_EVENT = {
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: "CAP1",
    status: "COMPLETED",
    custom_id: "inv_1",
    amount: { value: "12.99", currency_code: "USD" },
  },
};

function request(event, extraHeaders = SIG_HEADERS) {
  return new NextRequest("https://caluservers.com/api/paypal/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: typeof event === "string" ? event : JSON.stringify(event),
  });
}

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CommerceError";
    this.status = status;
  }
}

function route(mocks = {}) {
  const state = { recorded: [], provisioned: [], verified: [] };
  const h = loader({
    "@/lib/commerce": {
      CommerceError,
      recordGatewayPayment: async (input) => {
        state.recorded.push(input);
        if (mocks.recordThrows) throw mocks.recordThrows();
        return { id: "pay_1" };
      },
    },
    "@/lib/paypal": {
      PaypalError: class PaypalError extends Error {
        constructor(code) {
          super(code);
          this.name = "PaypalError";
          this.code = code;
        }
      },
      paypalWebhookReady: () => mocks.ready ?? true,
      readWebhookHeaders: (headers) =>
        mocks.badHeaders ? null : { authAlgo: headers.get("paypal-auth-algo") || "a" },
      verifyWebhook: async (input) => {
        state.verified.push(input);
        if (mocks.verifyThrows) throw mocks.verifyThrows();
        return mocks.verified ?? true;
      },
      readCapture: mocks.readCapture ?? ((payload) => realReadCapture(payload)),
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async (input) => {
        state.provisioned.push(input);
        return { attempted: true, provisioned: true };
      },
    },
  });
  return { api: h.load("app/api/paypal/webhook/route.ts"), state };
}

/** Copia mínima de readCapture para las pruebas de la ruta. */
function realReadCapture(payload) {
  const unit = payload?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find((item) => item?.status === "COMPLETED");
  if (!capture || typeof unit?.custom_id !== "string") return null;
  const value = capture.amount?.value;
  if (typeof value !== "string") return null;
  return {
    captureId: capture.id,
    amountCents: Math.round(Number(value) * 100),
    currency: capture.amount.currency_code,
    invoiceId: unit.custom_id,
  };
}

test("sin PAYPAL_WEBHOOK_ID el webhook responde 503 y no registra nada", async () => {
  const { api, state } = route({ ready: false });
  const response = await api.POST(request(CAPTURE_EVENT));
  assert.equal(response.status, 503);
  assert.equal(state.recorded.length, 0);
  assert.equal(state.verified.length, 0);
});

test("faltando cabeceras de firma se rechaza antes de verificar", async () => {
  const { api, state } = route({ badHeaders: true });
  const response = await api.POST(request(CAPTURE_EVENT, {}));
  assert.equal(response.status, 400);
  assert.equal(state.verified.length, 0);
  assert.equal(state.recorded.length, 0);
});

test("una firma inválida no registra el cobro", async () => {
  const { api, state } = route({ verified: false });
  const response = await api.POST(request(CAPTURE_EVENT));
  assert.equal(response.status, 400);
  assert.equal(state.recorded.length, 0);
});

test("si la verificación no se puede hacer se responde 503 para que PayPal reintente", async () => {
  const { api, state } = route({
    verifyThrows: () => new Error("sin red"),
  });
  const response = await api.POST(request(CAPTURE_EVENT));
  assert.equal(response.status, 503);
  assert.equal(state.recorded.length, 0);
});

test("un cuerpo que no es JSON se rechaza", async () => {
  const { api, state } = route();
  const response = await api.POST(request("no es json"));
  assert.equal(response.status, 400);
  assert.equal(state.verified.length, 0);
});

test("un evento gigante se corta", async () => {
  const { api } = route();
  const response = await api.POST(
    request({ event_type: "PAYMENT.CAPTURE.COMPLETED", padding: "x".repeat(300000) }),
  );
  assert.equal(response.status, 413);
});

test("se verifica el evento tal cual llegó, no una versión reconstruida", async () => {
  const { api, state } = route();
  await api.POST(request(CAPTURE_EVENT));
  assert.equal(state.verified[0].event.event_type, "PAYMENT.CAPTURE.COMPLETED");
  assert.equal(state.verified[0].event.resource.id, "CAP1");
});

test("un evento verificado registra el cobro y lanza el alta", async () => {
  const { api, state } = route();
  const response = await api.POST(request(CAPTURE_EVENT));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(state.recorded[0].invoiceId, "inv_1");
  assert.equal(state.recorded[0].providerRef, "CAP1");
  assert.equal(state.recorded[0].amountCents, 1299);
  assert.equal(state.recorded[0].source, "webhook");
  assert.equal(state.provisioned[0].invoiceId, "inv_1");
});

test("un evento que no mueve dinero se acepta sin registrar", async () => {
  const { api, state } = route();
  const response = await api.POST(
    request({ event_type: "BILLING.SUBSCRIPTION.CREATED", resource: {} }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ignored, "BILLING.SUBSCRIPTION.CREATED");
  assert.equal(state.recorded.length, 0);
});

test("un importe que no cuadra se rechaza con 409 y no pide reintento", async () => {
  const { api } = route({
    recordThrows: () => new CommerceError("El importe cobrado no coincide con la factura.", 409),
  });
  const response = await api.POST(request(CAPTURE_EVENT));
  assert.equal(response.status, 409);
});

test("un fallo de base responde 503 para que PayPal reintente el mismo evento", async () => {
  const { api } = route({
    recordThrows: () => Object.assign(new Error("db"), { code: "P2021" }),
  });
  const response = await api.POST(request(CAPTURE_EVENT));
  assert.equal(response.status, 503);
});
