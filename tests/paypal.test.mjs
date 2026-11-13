// Cobro con PayPal. Claves, ids y firmas son señuelos locales, nunca credenciales reales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader, headers } from "./helpers/load.mjs";

const ENV = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "TEST_ONLY_CLIENT_ID_CANARY_0001",
  PAYPAL_CLIENT_SECRET: "TEST_ONLY_CLIENT_SECRET_CANARY_0001",
  PAYPAL_WEBHOOK_ID: "TEST_ONLY_WEBHOOK_ID",
};

function build({ responses = [], env = ENV } = {}) {
  const calls = [];
  const queue = [...responses];
  const h = loader({
    "./outbound": {
      OutboundError: class OutboundError extends Error {
        constructor(code) {
          super(`outbound:${code}`);
          this.code = code;
        }
      },
      requestJson: async (options) => {
        calls.push(options);
        const next = queue.shift();
        if (!next) throw new Error("llamada de salida inesperada");
        if (next.throwCode) {
          const error = new Error("outbound");
          error.code = next.throwCode;
          error.name = "OutboundError";
          throw error;
        }
        return next;
      },
    },
    env,
  });
  const paypal = h.load("lib/paypal.ts");
  paypal.resetPaypalToken();
  return { paypal, calls };
}

const TOKEN_OK = { status: 200, json: { access_token: "TEST_ONLY_ACCESS", expires_in: 3600 } };

test("sin credenciales completas la pasarela no está lista", () => {
  for (const env of [
    {},
    { ...ENV, PAYPAL_ENV: "produccion" },
    { ...ENV, PAYPAL_CLIENT_ID: "corto" },
    { ...ENV, PAYPAL_CLIENT_SECRET: "" },
  ]) {
    const { paypal } = build({ env });
    assert.equal(paypal.paypalReady(), false);
  }
  assert.equal(build().paypal.paypalReady(), true);
});

test("el host depende del entorno y nunca se mezcla", async () => {
  const sandbox = build({ responses: [TOKEN_OK, { status: 200, json: {} }] });
  await sandbox.paypal.paypalOrderCapture("ABC123");
  assert.ok(sandbox.calls.every((call) => call.allowHosts.join() === "api-m.sandbox.paypal.com"));

  const live = build({
    env: { ...ENV, PAYPAL_ENV: "live" },
    responses: [TOKEN_OK, { status: 200, json: {} }],
  });
  await live.paypal.paypalOrderCapture("ABC123");
  assert.ok(live.calls.every((call) => call.allowHosts.join() === "api-m.paypal.com"));
});

test("el importe sale de los céntimos y rechaza monedas sin decimales", () => {
  const { paypal } = build();
  assert.equal(paypal.paypalAmount(1299, "USD"), "12.99");
  assert.equal(paypal.paypalAmount(100000, "USD"), "1000.00");
  for (const [cents, currency] of [
    [0, "USD"],
    [-1, "USD"],
    [1.5, "USD"],
    [1299, "JPY"],
  ]) {
    assert.throws(() => paypal.paypalAmount(cents, currency), (error) => error.name === "PaypalError");
  }
});

test("el importe de PayPal se vuelve a convertir a céntimos sin confiar en el texto", () => {
  const { paypal } = build();
  assert.equal(paypal.centsFromAmount("12.99"), 1299);
  assert.equal(paypal.centsFromAmount("12.9"), 1290);
  assert.equal(paypal.centsFromAmount("12"), 1200);
  for (const value of ["12.999", "-12.99", "1e3", "12,99", "", null, {}]) {
    assert.equal(paypal.centsFromAmount(value), null);
  }
});

test("el token se reutiliza mientras no caduca", async () => {
  const { paypal, calls } = build({
    responses: [TOKEN_OK, { status: 200, json: {} }, { status: 200, json: {} }],
  });
  await paypal.paypalOrderCapture("ABC123");
  await paypal.paypalOrderCapture("ABC123");
  assert.equal(calls.filter((call) => call.url.endsWith("/v1/oauth2/token")).length, 1);
});

test("la orden lleva la factura como custom_id y devuelve el enlace de pago", async () => {
  const { paypal, calls } = build({
    responses: [
      TOKEN_OK,
      {
        status: 201,
        json: {
          id: "ORDER1",
          status: "PAYER_ACTION_REQUIRED",
          links: [
            { rel: "self", href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1" },
            { rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1" },
          ],
        },
      },
    ],
  });
  const order = await paypal.createPaypalOrder({
    invoiceId: "inv_1",
    invoiceNumber: "PF-0001",
    description: "Plan",
    amountCents: 1299,
    currency: "USD",
    returnUrl: "https://caluservers.com/cuenta/pago",
    cancelUrl: "https://caluservers.com/cuenta",
    brandName: "CaluServers",
  });
  assert.equal(order.id, "ORDER1");
  assert.match(order.approveUrl, /^https:\/\/www\.sandbox\.paypal\.com\//);
  const body = JSON.parse(calls[1].body);
  assert.equal(body.purchase_units[0].custom_id, "inv_1");
  assert.equal(body.purchase_units[0].invoice_id, "PF-0001");
  assert.equal(body.purchase_units[0].amount.value, "12.99");
  assert.equal(calls[1].headers["PayPal-Request-Id"], "order-inv_1");
});

test("un enlace de pago que no sea de paypal.com se descarta", async () => {
  const { paypal } = build({
    responses: [
      TOKEN_OK,
      {
        status: 201,
        json: {
          id: "ORDER1",
          links: [{ rel: "payer-action", href: "https://atacante.example/checkout" }],
        },
      },
    ],
  });
  await assert.rejects(
    paypal.createPaypalOrder({
      invoiceId: "inv_1",
      invoiceNumber: "PF-0001",
      description: "Plan",
      amountCents: 1299,
      currency: "USD",
      returnUrl: "https://caluservers.com/cuenta/pago",
      cancelUrl: "https://caluservers.com/cuenta",
      brandName: "CaluServers",
    }),
    (error) => error.name === "PaypalError" && error.code === "upstream",
  );
});

test("readCapture solo acepta una captura COMPLETED con importe legible", () => {
  const { paypal } = build();
  const ok = paypal.readCapture({
    purchase_units: [
      {
        custom_id: "inv_1",
        payments: {
          captures: [
            { id: "CAP1", status: "PENDING", amount: { value: "12.99", currency_code: "USD" } },
            { id: "CAP2", status: "COMPLETED", amount: { value: "12.99", currency_code: "USD" } },
          ],
        },
      },
    ],
  });
  assert.equal(ok.captureId, "CAP2");
  assert.equal(ok.amountCents, 1299);
  assert.equal(ok.currency, "USD");
  assert.equal(ok.invoiceId, "inv_1");

  for (const payload of [
    null,
    {},
    { purchase_units: [] },
    { purchase_units: [{ custom_id: "inv_1", payments: { captures: [] } }] },
    {
      purchase_units: [
        { custom_id: "inv_1", payments: { captures: [{ id: "C", status: "DECLINED" }] } },
      ],
    },
    {
      // Sin custom_id no se sabe qué factura es: no se acepta.
      purchase_units: [
        {
          payments: {
            captures: [{ id: "C", status: "COMPLETED", amount: { value: "1.00", currency_code: "USD" } }],
          },
        },
      ],
    },
  ]) {
    assert.equal(paypal.readCapture(payload), null);
  }
});

test("una orden ya capturada se relee en lugar de fallar", async () => {
  const captured = {
    purchase_units: [
      {
        custom_id: "inv_1",
        payments: {
          captures: [
            { id: "CAP9", status: "COMPLETED", amount: { value: "12.99", currency_code: "USD" } },
          ],
        },
      },
    ],
  };
  const { paypal } = build({
    responses: [TOKEN_OK, { status: 422, json: { name: "UNPROCESSABLE_ENTITY" } }, { status: 200, json: captured }],
  });
  const capture = await paypal.capturePaypalOrder("ORDER1");
  assert.equal(capture.captureId, "CAP9");
});

test("un id de orden con forma extraña no sale a la red", async () => {
  const { paypal, calls } = build();
  for (const id of ["", "../../x", "ORDER 1", "a".repeat(40), "orden;rm"]) {
    await assert.rejects(
      paypal.capturePaypalOrder(id),
      (error) => error.name === "PaypalError" && error.code === "mismatch",
    );
  }
  assert.equal(calls.length, 0);
});

test("las cabeceras del webhook se exigen completas y el certificado solo de paypal.com", () => {
  const { paypal } = build();
  const base = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
    "paypal-transmission-id": "tid",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-11-12T00:00:00Z",
  };
  assert.ok(paypal.readWebhookHeaders(headers(base)));
  for (const override of [
    { "paypal-auth-algo": "" },
    { "paypal-transmission-sig": "" },
    { "paypal-cert-url": "https://atacante.example/cert" },
    { "paypal-cert-url": "http://api.paypal.com/cert" },
    { "paypal-cert-url": "https://paypal.com.atacante.example/cert" },
    { "paypal-cert-url": "no-es-una-url" },
  ]) {
    assert.equal(paypal.readWebhookHeaders(headers({ ...base, ...override })), null);
  }
});

test("sin PAYPAL_WEBHOOK_ID no se verifica ni se acepta un evento", async () => {
  const { paypal } = build({ env: { ...ENV, PAYPAL_WEBHOOK_ID: "" } });
  assert.equal(paypal.paypalWebhookReady(), false);
  await assert.rejects(
    paypal.verifyWebhook({
      headers: {
        authAlgo: "a",
        certUrl: "https://api.paypal.com/c",
        transmissionId: "t",
        transmissionSig: "s",
        transmissionTime: "now",
      },
      event: {},
    }),
    (error) => error.name === "PaypalError" && error.code === "unconfigured",
  );
});

test("la verificación solo pasa con SUCCESS de PayPal", async () => {
  const args = {
    headers: {
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.paypal.com/c",
      transmissionId: "t",
      transmissionSig: "s",
      transmissionTime: "now",
    },
    event: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
  };
  const good = build({ responses: [TOKEN_OK, { status: 200, json: { verification_status: "SUCCESS" } }] });
  assert.equal(await good.paypal.verifyWebhook(args), true);
  const sent = JSON.parse(good.calls[1].body);
  assert.equal(sent.webhook_id, ENV.PAYPAL_WEBHOOK_ID);
  assert.equal(sent.transmission_sig, "s");

  for (const response of [
    { status: 200, json: { verification_status: "FAILURE" } },
    { status: 200, json: {} },
    { status: 400, json: { verification_status: "SUCCESS" } },
  ]) {
    const bad = build({ responses: [TOKEN_OK, response] });
    assert.equal(await bad.paypal.verifyWebhook(args), false);
  }
});
