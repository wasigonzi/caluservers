// Motor de fraude propio (Fase 6, frente A): reglas velocity, amount,
// email_domain e ip; acción "block" tratada como "flag"; la evaluación
// nunca lanza. BD falsa en memoria; sin red ni servicios reales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const RULES = [
  { id: "fraud_velocity", name: "Demasiados pedidos en una hora", kind: "velocity", configJson: { maxOrders: 3, windowMinutes: 60 }, action: "flag", active: true, order: 1 },
  { id: "fraud_amount", name: "Pedido de importe alto", kind: "amount", configJson: { maxCents: 50000 }, action: "flag", active: true, order: 2 },
  { id: "fraud_disposable_email", name: "Correo de dominio desechable", kind: "email_domain", configJson: { domains: ["mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com", "yopmail.com"] }, action: "flag", active: true, order: 3 },
  { id: "fraud_shared_ip", name: "Muchas cuentas desde la misma IP", kind: "ip", configJson: { maxAccounts: 3, windowMinutes: 1440 }, action: "flag", active: true, order: 4 },
];

function fakeFraudDb(overrides = {}) {
  let seq = 0;
  const state = {
    orders: [],
    flags: [],
    audit: [],
    rules: overrides.rules ?? RULES,
    failRules: overrides.failRules ?? false,
  };
  const db = {
    state,
    fraudRule: {
      findMany: async () => {
        if (state.failRules) throw new Error("la BD de reglas falló");
        return state.rules.filter((rule) => rule.active);
      },
    },
    customerOrder: {
      count: async ({ where }) => {
        const since = where?.createdAt?.gte;
        return state.orders.filter(
          (order) => order.userId === where.userId && (!since || order.createdAt >= since),
        ).length;
      },
      create: async ({ data }) => {
        const row = { id: `order_${++seq}`, createdAt: new Date(), ...data };
        state.orders.push(row);
        return row;
      },
      findUnique: async ({ where }) => state.orders.find((order) => order.id === where.id) ?? null,
    },
    fraudFlag: {
      create: async ({ data }) => {
        const row = { id: `flag_${++seq}`, status: "open", ...data };
        state.flags.push(row);
        return row;
      },
    },
    auditLog: {
      findMany: async ({ where }) => {
        const since = where?.createdAt?.gte;
        return state.audit.filter(
          (row) => row.ipHash === where.ipHash && (!since || row.createdAt >= since),
        );
      },
    },
  };
  return db;
}

const h = loader({});
const fraud = h.load("lib/fraud.ts");

test("velocity marca con 4 pedidos en 1 h y no marca con 3", async () => {
  const db = fakeFraudDb();
  const now = new Date();
  db.state.orders.push(
    { userId: "user-1", createdAt: new Date(now.getTime() - 10 * 60_000) },
    { userId: "user-1", createdAt: new Date(now.getTime() - 20 * 60_000) },
    { userId: "user-1", createdAt: new Date(now.getTime() - 30 * 60_000) },
  );
  // El pedido que se evalúa ya está creado y cuenta: 4 en la ventana.
  db.state.orders.push({ userId: "user-1", createdAt: now });
  const flagged = await fraud.evaluateFraud({ userId: "user-1", orderId: "order_9", email: "ana@example.com", ipHash: null, totalCents: 399, db });
  assert.equal(flagged.flagged, true);
  assert.equal(flagged.flags.length, 1);
  assert.match(flagged.flags[0].reason, /Más de 3 pedidos en 60 minutos \(4 pedidos\)/);

  const db2 = fakeFraudDb();
  db2.state.orders.push(
    { userId: "user-1", createdAt: new Date(now.getTime() - 10 * 60_000) },
    { userId: "user-1", createdAt: new Date(now.getTime() - 20 * 60_000) },
    { userId: "user-1", createdAt: now },
  );
  const notFlagged = await fraud.evaluateFraud({ userId: "user-1", orderId: "order_9", email: "ana@example.com", ipHash: null, totalCents: 399, db: db2 });
  assert.equal(notFlagged.flagged, false);
  assert.equal(notFlagged.flags.length, 0);
});

test("amount marca por encima de $500 y no marca en $500 exactos", async () => {
  const db = fakeFraudDb();
  const over = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: null, totalCents: 50001, db });
  assert.equal(over.flagged, true);
  assert.match(over.flags[0].reason, /superior al máximo de \$500\.00/);

  const db2 = fakeFraudDb();
  const exact = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: null, totalCents: 50000, db: db2 });
  assert.equal(exact.flagged, false);
});

test("dominio desechable marca y un dominio normal no", async () => {
  const db = fakeFraudDb();
  const flagged = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "temp@mailinator.com", ipHash: null, totalCents: 399, db });
  assert.equal(flagged.flagged, true);
  assert.match(flagged.flags[0].reason, /mailinator\.com.*desechable/);

  const db2 = fakeFraudDb();
  const clean = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@empresa.com", ipHash: null, totalCents: 399, db: db2 });
  assert.equal(clean.flagged, false);
});

test("la regla de IP marca con más de 3 cuentas distintas con el mismo hash", async () => {
  const db = fakeFraudDb();
  const now = new Date();
  db.state.audit.push(
    { actorId: "user-a", ipHash: "hash-ip", createdAt: now },
    { actorId: "user-b", ipHash: "hash-ip", createdAt: now },
    { actorId: "user-c", ipHash: "hash-ip", createdAt: now },
  );
  const flagged = await fraud.evaluateFraud({ userId: "user-d", orderId: "o1", email: "ana@example.com", ipHash: "hash-ip", totalCents: 399, db });
  assert.equal(flagged.flagged, true);
  assert.match(flagged.flags[0].reason, /Más de 3 cuentas distintas con la misma IP \(4 cuentas\)/);

  const db2 = fakeFraudDb();
  db2.state.audit.push(
    { actorId: "user-a", ipHash: "hash-ip", createdAt: now },
    { actorId: "user-b", ipHash: "hash-ip", createdAt: now },
  );
  const clean = await fraud.evaluateFraud({ userId: "user-c", orderId: "o1", email: "ana@example.com", ipHash: "hash-ip", totalCents: 399, db: db2 });
  assert.equal(clean.flagged, false);
});

test("la regla de IP no marca sin ipHash ni sin entradas de auditoría", async () => {
  const db = fakeFraudDb();
  const noHash = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: null, totalCents: 399, db });
  assert.equal(noHash.flagged, false);
  const noRows = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: "hash-ip", totalCents: 399, db });
  assert.equal(noRows.flagged, false);
});

test("una regla en modo block se trata como flag y deja constancia en el motivo", async () => {
  const rules = RULES.map((rule) => (rule.kind === "amount" ? { ...rule, action: "block" } : rule));
  const db = fakeFraudDb({ rules });
  const result = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: null, totalCents: 60000, db });
  assert.equal(result.flagged, true);
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].status, "open");
  assert.match(result.flags[0].reason, /modo «block», tratado como marca/);
});

test("la evaluación nunca lanza: con la BD rota devuelve sin marcar", async () => {
  const db = fakeFraudDb({ failRules: true });
  const result = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "ana@example.com", ipHash: null, totalCents: 999999, db });
  assert.equal(result.flagged, false);
  assert.equal(result.flags.length, 0);
});

test("varias reglas pueden marcar el mismo pedido", async () => {
  const db = fakeFraudDb();
  const now = new Date();
  db.state.orders.push(
    { userId: "user-1", createdAt: new Date(now.getTime() - 5 * 60_000) },
    { userId: "user-1", createdAt: new Date(now.getTime() - 6 * 60_000) },
    { userId: "user-1", createdAt: new Date(now.getTime() - 7 * 60_000) },
    { userId: "user-1", createdAt: now },
  );
  const result = await fraud.evaluateFraud({ userId: "user-1", orderId: "o1", email: "t@yopmail.com", ipHash: null, totalCents: 60000, db });
  assert.equal(result.flagged, true);
  assert.equal(result.flags.length, 3);
});

// --- Enganche en createCustomerOrder: el flag no bloquea el pedido ---

function fakeCommerceDb() {
  let seq = 100;
  const state = {
    orders: [],
    ordersByKey: new Map(),
    invoices: new Map(),
    events: [],
    flags: [],
    users: new Map([["user-1", { id: "user-1", email: "ana@example.com" }]]),
  };
  const db = {
    state,
    $transaction: async (fn) => fn(db),
    catalogConfig: { findUnique: async () => null },
    fraudRule: {
      findMany: async () => RULES.filter((rule) => rule.active),
    },
    customerOrder: {
      count: async ({ where }) => {
        const since = where?.createdAt?.gte;
        return state.orders.filter(
          (order) => order.userId === where.userId && (!since || order.createdAt >= since),
        ).length;
      },
      findUnique: async ({ where }) => state.ordersByKey.get(where.idempotencyKey) ?? null,
      create: async ({ data }) => {
        const row = { id: `order_${++seq}`, createdAt: new Date(), ...data };
        state.orders.push(row);
        state.ordersByKey.set(data.idempotencyKey, row);
        return row;
      },
    },
    fraudFlag: {
      create: async ({ data }) => {
        const row = { id: `flag_${++seq}`, status: "open", ...data };
        state.flags.push(row);
        return row;
      },
    },
    auditLog: { findMany: async () => [] },
    customerInvoice: {
      create: async ({ data }) => {
        const row = { id: `inv_${++seq}`, createdAt: new Date(), ...data };
        state.invoices.set(row.id, row);
        return row;
      },
    },
    commerceEvent: {
      create: async ({ data }) => {
        const row = { id: `ev_${++seq}`, createdAt: new Date(), ...data };
        state.events.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        state.events.find((ev) => ev.action === where.action && ev.entityId === where.entityId) ?? null,
    },
    user: {
      findUnique: async ({ where }) => state.users.get(where.id) ?? null,
    },
  };
  return db;
}

test("un pedido marcado por velocidad se crea igual y queda señalado para revisión", async () => {
  const db = fakeCommerceDb();
  const now = new Date();
  for (const minutes of [5, 10, 15]) {
    const prev = { id: `prev-${minutes}`, userId: "user-1", createdAt: new Date(now.getTime() - minutes * 60_000) };
    db.state.orders.push(prev);
    db.state.ordersByKey.set(`prev-${minutes}`, prev);
  }
  const h2 = loader({
    "./db": { db },
    "./billing-recurring": {
      applyPromo: async () => { throw new Error("sin promo en esta prueba"); },
      consumePromoUse: async () => {},
      advanceSubscriptionAfterPayment: async () => {},
      createSubscriptionForService: async () => {},
    },
    "./whm-provision": { isPanelKey: (key) => key === "whm", parsePanelMap: () => ({}) },
    env: { BILLING_CURRENCY: "USD", TAX_MODE: "none" },
  });
  const commerce = h2.load("lib/commerce.ts");
  const order = await commerce.createCustomerOrder({ userId: "user-1", planId: "wh0", idempotencyKey: "idem-fraud-0001", domain: "ejemplo.com" });
  assert.equal(order.status, "submitted");
  assert.equal(order.invoice.status, "issued");
  assert.equal(db.state.flags.length, 1);
  assert.equal(db.state.flags[0].orderId, order.id);
  const flaggedEvent = db.state.events.find((ev) => ev.action === "fraud.flagged");
  assert.ok(flaggedEvent);
  assert.equal(flaggedEvent.entityId, order.id);

  // Repetir con la misma clave de idempotencia devuelve el pedido sin duplicar flags.
  const again = await commerce.createCustomerOrder({ userId: "user-1", planId: "wh0", idempotencyKey: "idem-fraud-0001", domain: "ejemplo.com" });
  assert.equal(again.id, order.id);
  assert.equal(db.state.flags.length, 1);
});
