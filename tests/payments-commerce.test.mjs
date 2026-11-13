// Límite de peticiones públicas y registro de cobros. Datos y claves son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader, headers } from "./helpers/load.mjs";

/* --------------------------- límite de peticiones --------------------------- */

function throttle(mocks = {}) {
  const queries = [];
  const h = loader({
    "./db": {
      db: {
        $queryRaw: async (...args) => {
          queries.push(args);
          return mocks.rows ?? [{ hits: 1, windowStart: new Date() }];
        },
      },
    },
    env: mocks.env,
  });
  return { module: h.load("lib/request-throttle.ts"), queries };
}

test("sin AUTH_SECRET no hay clave de límite: falla cerrado", () => {
  const { module } = throttle({ env: { AUTH_SECRET: "corto" } });
  assert.throws(
    () => module.requestThrottleId("contact", "1.2.3.4"),
    (error) => error.name === "RequestThrottleConfigError",
  );
});

test("la clave es un HMAC distinto por ámbito y no contiene la IP", () => {
  const { module } = throttle();
  const contact = module.requestThrottleId("contact", "203.0.113.9");
  const domain = module.requestThrottleId("domain-lookup", "203.0.113.9");
  assert.match(contact, /^[a-f0-9]{64}$/);
  assert.notEqual(contact, domain);
  assert.ok(!contact.includes("203.0.113.9"));
  assert.throws(() => module.requestThrottleId("otro-ambito", "x"));
});

test("el veredicto permite dentro del presupuesto y bloquea al pasarlo", () => {
  const { module } = throttle();
  const now = Date.now();
  const start = new Date(now - 60_000);
  const { max } = module.throttleBudget("contact");
  assert.equal(module.throttleVerdict("contact", 1, start, now).allowed, true);
  assert.equal(module.throttleVerdict("contact", max, start, now).allowed, true);
  const blocked = module.throttleVerdict("contact", max + 1, start, now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);
});

test("una ventana caducada vuelve a permitir", () => {
  const { module } = throttle();
  const now = Date.now();
  const { windowMs, max } = module.throttleBudget("contact");
  const old = new Date(now - windowMs - 1000);
  assert.equal(module.throttleVerdict("contact", max + 100, old, now).allowed, true);
});

test("el contador se actualiza en una sola sentencia atómica", async () => {
  const { module, queries } = throttle({ rows: [{ hits: 3, windowStart: new Date() }] });
  const verdict = await module.consumeRequest("contact", "ip");
  assert.equal(verdict.allowed, true);
  assert.equal(queries.length, 1);
  const sql = queries[0][0].join(" ");
  assert.match(sql, /INSERT INTO "RequestThrottle"/);
  assert.match(sql, /ON CONFLICT/);
});

test("si la tabla no devuelve fila, el límite falla en lugar de permitir", async () => {
  const { module } = throttle({ rows: [] });
  await assert.rejects(module.consumeRequest("contact", "ip"));
});

test("clientRateKey prefiere la IP de la plataforma y no la lista del llamante", () => {
  const h = loader({});
  const rate = h.load("lib/login-rate-limit.ts");
  assert.equal(
    rate.clientRateKey(
      headers({
        "x-vercel-forwarded-for": "198.51.100.7, 10.0.0.1",
        "x-forwarded-for": "1.2.3.4",
      }),
    ),
    "198.51.100.7",
  );
  assert.equal(rate.clientRateKey(headers({ "x-forwarded-for": "1.2.3.4" })), "local");
});

/* ------------------------------ cobros ------------------------------ */

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
  order: { planId: "plan-basico", planName: "Hosting Básico", domain: "midominio.com" },
};

function commerce(mocks = {}) {
  const state = { payments: [], services: [], events: [], invoiceUpdates: [] };
  const invoice = mocks.invoice === undefined ? INVOICE : mocks.invoice;
  const tx = {
    customerInvoice: {
      findUnique: async () => (invoice ? { ...invoice } : null),
      update: async (args) => {
        state.invoiceUpdates.push(args.data);
        return args.data;
      },
    },
    payment: {
      findUnique: async () => mocks.existingByRef ?? null,
      create: async (args) => {
        if (mocks.uniqueViolation) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        state.payments.push(args.data);
        return { id: "pay_1", ...args.data };
      },
    },
    customerService: {
      create: async (args) => {
        state.services.push(args.data);
        return args.data;
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
    env: { BILLING_CURRENCY: "USD", TAX_MODE: "none", ...mocks.env },
  });
  return { module: h.load("lib/commerce.ts"), state };
}

test("un cobro de pasarela exige que el importe y la moneda cuadren con la factura", async () => {
  for (const [amountCents, currency] of [
    [1, "USD"],
    [1300, "USD"],
    [1299, "EUR"],
  ]) {
    const { module, state } = commerce();
    await assert.rejects(
      module.recordGatewayPayment({
        invoiceId: "inv_1",
        providerRef: "CAP1",
        amountCents,
        currency,
        source: "capture",
      }),
      (error) => error.name === "CommerceError" && error.status === 409,
      `${amountCents} ${currency}`,
    );
    assert.equal(state.payments.length, 0);
  }
});

test("un cobro correcto marca la factura pagada y crea el servicio pendiente", async () => {
  const { module, state } = commerce();
  const payment = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    providerRef: "CAP1",
    amountCents: 1299,
    currency: "USD",
    source: "capture",
  });
  assert.equal(payment.provider, "paypal");
  assert.equal(payment.providerRef, "CAP1");
  assert.equal(payment.amountCents, 1299);
  assert.equal(state.invoiceUpdates[0].status, "paid");
  assert.equal(state.services[0].status, "pending_provision");
  assert.match(state.events[0].details, /provider=paypal/);
});

test("la misma referencia de captura no cobra dos veces", async () => {
  const { module, state } = commerce({
    existingByRef: { id: "pay_old", providerRef: "CAP1", status: "confirmed" },
  });
  const payment = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    providerRef: "CAP1",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
  });
  assert.equal(payment.id, "pay_old");
  assert.equal(state.payments.length, 0);
});

test("una carrera entre la vuelta del cliente y el webhook deja un solo cobro", async () => {
  // El primer cobro ya se insertó en la otra vía: el segundo insert choca con la
  // unicidad y se devuelve el que existe, sin crear un duplicado ni un segundo servicio.
  let reads = 0;
  const state = { payments: [], services: [] };
  const tx = {
    customerInvoice: {
      findUnique: async () => {
        reads += 1;
        // La primera lectura ocurre dentro de la transacción, antes del choque.
        return reads === 1
          ? { ...INVOICE, payment: null }
          : { ...INVOICE, payment: { id: "pay_rival", status: "confirmed" } };
      },
      update: async (args) => args.data,
    },
    payment: {
      findUnique: async () => null,
      create: async () => {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      },
    },
    customerService: {
      create: async (args) => {
        state.services.push(args.data);
        return args.data;
      },
    },
    commerceEvent: { create: async (args) => args.data },
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
  const module = h.load("lib/commerce.ts");
  const payment = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    providerRef: "CAP2",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
  });
  assert.equal(payment.id, "pay_rival");
  assert.equal(state.payments.length, 0);
  assert.equal(state.services.length, 0);
});

test("una referencia de pasarela con forma extraña no se registra", async () => {
  const { module } = commerce();
  for (const ref of ["", "x", "a".repeat(80), "cap 1", "cap;drop"]) {
    await assert.rejects(
      module.recordGatewayPayment({
        invoiceId: "inv_1",
        providerRef: ref,
        amountCents: 1299,
        currency: "USD",
        source: "webhook",
      }),
      (error) => error.status === 400,
    );
  }
});

test("una proforma no cobrable no acepta cobro", async () => {
  const { module } = commerce({
    invoice: { ...INVOICE, taxMode: "unconfigured", taxCents: null },
  });
  await assert.rejects(
    module.recordGatewayPayment({
      invoiceId: "inv_1",
      providerRef: "CAP1",
      amountCents: 1299,
      currency: "USD",
      source: "capture",
    }),
    (error) => error.status === 409,
  );
});

test("sin moneda configurada no se registra ningún cobro", async () => {
  const { module } = commerce({ env: { BILLING_CURRENCY: "", TAX_MODE: "" } });
  await assert.rejects(
    module.recordGatewayPayment({
      invoiceId: "inv_1",
      providerRef: "CAP1",
      amountCents: 1299,
      currency: "USD",
      source: "capture",
    }),
    (error) => error.status === 409,
  );
});

test("una factura ya pagada devuelve el cobro existente sin duplicar", async () => {
  const { module, state } = commerce({
    invoice: { ...INVOICE, payment: { id: "pay_old", status: "confirmed" } },
  });
  const payment = await module.recordGatewayPayment({
    invoiceId: "inv_1",
    providerRef: "CAP3",
    amountCents: 1299,
    currency: "USD",
    source: "webhook",
  });
  assert.equal(payment.id, "pay_old");
  assert.equal(state.payments.length, 0);
});

test("el dominio es obligatorio en hosting y se normaliza; en VPS no se pide", () => {
  const { module } = commerce();
  assert.equal(module.orderDomainFor("webHosting", " MiDominio.COM "), "midominio.com");
  assert.equal(module.orderDomainFor("vps", ""), null);
  assert.equal(module.orderDomainFor("dedicated", "midominio.com"), null);
  for (const value of ["", "   ", "midominio", "a.b.midominio.com", "mi dominio.com"]) {
    assert.throws(
      () => module.orderDomainFor("webHosting", value),
      (error) => error.name === "CommerceError" && error.status === 400,
      `debía rechazar: ${value}`,
    );
  }
});
