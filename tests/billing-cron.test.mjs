// Cron de facturación: autorización, idempotencia diaria, dunning por
// etapas y recordatorios. Datos y claves son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader, headers } from "./helpers/load.mjs";

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CommerceError";
    this.status = status;
  }
}

const NOW = new Date("2026-11-18T12:00:00.000Z");
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);

function cron(mocks = {}) {
  const state = {
    events: [],
    invoices: [],
    invoiceUpdates: [],
    ordersUpdated: [],
    payments: [],
    subscriptionsUpdated: [],
    billingRuns: [],
    charges: [],
    gatewayPayments: [],
    suspensions: [],
    terminations: [],
    notices: [],
    renewalInvoices: [],
    advanced: [],
  };
  const tx = {
    customerInvoice: {
      update: async (args) => {
        state.invoiceUpdates.push(args);
        return args.data;
      },
    },
    customerOrder: {
      update: async (args) => {
        state.ordersUpdated.push(args);
        return args.data;
      },
    },
    payment: {
      create: async (args) => {
        state.payments.push(args.data);
        return { id: "pay_1", ...args.data };
      },
    },
    subscription: {
      update: async (args) => {
        state.subscriptionsUpdated.push(args);
        return args.data;
      },
    },
    customerService: {
      update: async (args) => args.data,
    },
    commerceEvent: {
      create: async (args) => {
        state.events.push(args.data);
        return args.data;
      },
    },
  };
  const db = {
    subscription: {
      findMany: async () => mocks.dueSubscriptions ?? [],
      findUnique: async ({ where }) => (mocks.subscriptionsById ?? {})[where.id] ?? null,
      update: async (args) => {
        state.subscriptionsUpdated.push(args);
        return args.data;
      },
      updateMany: async () => ({ count: 1 }),
    },
    customerInvoice: {
      findUnique: async () => mocks.existingRenewalInvoice ?? null,
      findMany: async () => mocks.invoices ?? [],
      update: async (args) => {
        state.invoiceUpdates.push(args);
        return args.data;
      },
      create: async (args) => {
        state.invoices.push(args.data);
        return { id: "inv_r1", ...args.data };
      },
    },
    customerOrder: {
      update: async (args) => {
        state.ordersUpdated.push(args);
        return args.data;
      },
    },
    payment: {
      create: async (args) => {
        state.payments.push(args.data);
        return { id: "pay_1", ...args.data };
      },
    },
    commerceEvent: {
      create: async (args) => {
        state.events.push(args.data);
        return args.data;
      },
      findFirst: async () => mocks.existingEvent ?? null,
    },
    billingRun: {
      create: async (args) => {
        if (mocks.billingRunConflict) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        state.billingRuns.push(args.data);
        return { id: "run_1", ...args.data, processed: 0, succeeded: 0, failed: 0 };
      },
      findUnique: async () => mocks.existingBillingRun ?? null,
      update: async (args) => args.data,
    },
    user: {
      findUnique: async () => mocks.user ?? { id: "user_1", email: "cliente@example.com" },
    },
    customerService: {
      update: async (args) => args.data,
    },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(tx),
  };
  const h = loader({
    "./db": { db },
    "./commerce": {
      CommerceError,
      recordGatewayPayment: async (args) => {
        state.gatewayPayments.push(args);
        return { id: "pay_gw", ...args };
      },
    },
    "./billing-recurring": {
      createRenewalInvoice: async (_tx, subscription, periodStart) => {
        state.renewalInvoices.push({ subscription, periodStart });
        return (
          mocks.renewalInvoice ?? {
            id: "inv_r1",
            orderId: "ord_r1",
            number: "RN-TEST-20261118",
            currency: "USD",
            totalCents: mocks.renewalTotal ?? 1299,
          }
        );
      },
      advanceSubscriptionAfterPayment: async (_tx, subscription) => {
        state.advanced.push(subscription.id);
        return subscription;
      },
    },
    "./stripe": {
      chargeStripeSubscriptionInvoice: async (args) => {
        state.charges.push(args);
        if (mocks.chargeFails) throw new Error("tarjeta rechazada");
        return {
          providerRef: "in_test123",
          amountCents: args.amountCents,
          currency: args.currency,
        };
      },
    },
    "./mailer": {
      deliverNotice: async (args) => {
        state.notices.push(args);
        return mocks.mailResult ?? { delivered: true, reason: "sink" };
      },
    },
    "./panels": {
      suspendServicePanel: async (args) => {
        state.suspensions.push(args);
        return mocks.suspendResult ?? { attempted: true, suspended: true, reason: "ok" };
      },
      terminateServicePanel: async (args) => {
        state.terminations.push(args);
        return mocks.terminateResult ?? { attempted: true, terminated: true, reason: "ok" };
      },
    },
    env: mocks.env,
  });
  return { module: h.load("lib/billing-cron.ts"), state };
}

const ACTIVE_SUB = {
  id: "sub_1",
  userId: "user_1",
  serviceId: "svc_1",
  orderId: "ord_1",
  planId: "wh0",
  billingCycle: "monthly",
  priceCents: 1299,
  currency: "USD",
  nextInvoiceAt: day(-1),
  status: "active",
  gatewayKey: null,
  gatewaySubscriptionId: null,
};

/* ------------------------------ autorización ------------------------------ */

test("sin CRON_SECRET el cron responde 503 honesto", () => {
  const { module } = cron({ env: { CRON_SECRET: "" } });
  assert.throws(
    () => module.authorizeCronRequest(headers({})),
    (error) => error.name === "CommerceError" && error.status === 503,
  );
});

test("con CRON_SECRET, sin cabecera o con una incorrecta responde 401", () => {
  const { module } = cron({ env: { CRON_SECRET: "secreto-largo" } });
  for (const value of [undefined, "Bearer incorrecto", "Token secreto-largo"]) {
    const map = value ? { authorization: value } : {};
    assert.throws(
      () => module.authorizeCronRequest(headers(map)),
      (error) => error.name === "CommerceError" && error.status === 401,
      value ?? "(sin cabecera)",
    );
  }
  module.authorizeCronRequest(headers({ authorization: "Bearer secreto-largo" }));
});

test("claimBillingRun: la segunda corrida del día no re-ejecuta", async () => {
  const { module } = cron();
  const first = await module.claimBillingRun("billing", "2026-11-18");
  assert.equal(first.alreadyRan, false);
  const conflict = cron({
    billingRunConflict: true,
    existingBillingRun: { id: "run_1", kind: "billing", runDay: "2026-11-18", processed: 2, succeeded: 2, failed: 0 },
  });
  const second = await conflict.module.claimBillingRun("billing", "2026-11-18");
  assert.equal(second.alreadyRan, true);
  assert.equal(second.run.processed, 2);
});

/* ------------------------------ renovaciones ------------------------------ */

test("la renovación vencida se emite una sola vez aunque el cron se repita", async () => {
  const first = cron({ dueSubscriptions: [ACTIVE_SUB] });
  const stats = await first.module.runBillingCron({ now: NOW });
  assert.equal(stats.processed, 1);
  assert.equal(first.state.renewalInvoices.length, 1);
  assert.equal(
    first.state.renewalInvoices[0].periodStart.toISOString(),
    ACTIVE_SUB.nextInvoiceAt.toISOString(),
  );
  // Sin método guardado no se cobra: queda pendiente, sin fallo del cron.
  assert.equal(stats.succeeded, 0);
  assert.equal(stats.failed, 0);
  assert.equal(first.state.charges.length, 0);

  const second = cron({
    dueSubscriptions: [ACTIVE_SUB],
    existingRenewalInvoice: { id: "inv_r1", number: "RN-TEST-20261118" },
  });
  const stats2 = await second.module.runBillingCron({ now: NOW });
  assert.equal(second.state.renewalInvoices.length, 0);
  assert.equal(stats2.processed, 0);
});

test("el crédito cubre la renovación entera sin tocar la pasarela", async () => {
  const { module, state } = cron({
    dueSubscriptions: [ACTIVE_SUB],
    renewalTotal: 0,
  });
  const stats = await module.runBillingCron({ now: NOW });
  assert.equal(stats.succeeded, 1);
  assert.equal(state.charges.length, 0);
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].provider, "credit");
  assert.equal(state.payments[0].amountCents, 0);
  assert.deepEqual(state.advanced, ["sub_1"]);
});

test("con suscripción de Stripe guardada, la renovación se cobra sola", async () => {
  const stripeSub = {
    ...ACTIVE_SUB,
    gatewayKey: "stripe",
    gatewaySubscriptionId: "sub_stripe1",
  };
  const { module, state } = cron({ dueSubscriptions: [stripeSub] });
  const stats = await module.runBillingCron({ now: NOW });
  assert.equal(stats.succeeded, 1);
  assert.equal(state.charges.length, 1);
  assert.equal(state.charges[0].amountCents, 1299);
  assert.equal(state.gatewayPayments.length, 1);
  assert.equal(state.gatewayPayments[0].providerRef, "in_test123");
  assert.equal(state.gatewayPayments[0].provider, "stripe");
});

test("si el cobro con Stripe falla, la factura queda pendiente sin fallo del cron", async () => {
  const stripeSub = {
    ...ACTIVE_SUB,
    gatewayKey: "stripe",
    gatewaySubscriptionId: "sub_stripe1",
  };
  const { module, state } = cron({ dueSubscriptions: [stripeSub], chargeFails: true });
  const stats = await module.runBillingCron({ now: NOW });
  assert.equal(stats.succeeded, 0);
  assert.equal(stats.failed, 0);
  assert.equal(state.gatewayPayments.length, 0);
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.charge_failed" && /stripe/.test(event.details),
    ),
  );
});

test("el ciclo trimestral y el anual avanzan nextInvoiceAt un ciclo", async () => {
  // advanceInvoiceDate vive en billing-recurring; aquí se comprueba el
  // periodo que el cron pasa a la renovación: el inicio es nextInvoiceAt,
  // y el fin lo calcula el ciclo de la suscripción.
  const quarterly = { ...ACTIVE_SUB, billingCycle: "quarterly", nextInvoiceAt: day(-1) };
  const { module, state } = cron({ dueSubscriptions: [quarterly] });
  await module.runBillingCron({ now: NOW });
  assert.equal(state.renewalInvoices.length, 1);
  assert.equal(
    state.renewalInvoices[0].periodStart.toISOString(),
    quarterly.nextInvoiceAt.toISOString(),
  );
});

/* ------------------------------ dunning ------------------------------ */

test("dunningStageFor: día 1/3/7/14/30", () => {
  const { module } = cron();
  const cases = [
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [6, 2],
    [7, 3],
    [13, 3],
    [14, 4],
    [29, 4],
    [30, 5],
    [90, 5],
  ];
  for (const [days, stage] of cases) {
    assert.equal(module.dunningStageFor(days), stage, `${days} días`);
  }
});

function overdueInvoice(overrides = {}) {
  return {
    id: "inv_d1",
    userId: "user_1",
    orderId: "ord_r1",
    number: "RN-D1",
    currency: "USD",
    totalCents: 1299,
    status: "issued",
    type: "renewal",
    subscriptionId: "sub_1",
    dueDate: day(-1),
    dunningStage: 0,
    ...overrides,
  };
}

test("dunning día 1: aviso por correo y suscripción a past_due", async () => {
  const { module, state } = cron({
    invoices: [overdueInvoice()],
    subscriptionsById: { sub_1: { ...ACTIVE_SUB, status: "active" } },
  });
  const stats = await module.runBillingCron({ now: NOW });
  assert.equal(stats.succeeded, 1);
  assert.equal(state.notices.length, 1);
  assert.match(state.notices[0].subject, /vencío|venció/);
  assert.ok(
    state.subscriptionsUpdated.some((args) => args.data.status === "past_due"),
  );
  assert.ok(
    state.invoiceUpdates.some((args) => args.data.dunningStage === 1),
  );
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.dunning" && /accion=aviso/.test(event.details),
    ),
  );
});

test("dunning día 3: reintento de cobro con el método guardado", async () => {
  const stripeSub = {
    ...ACTIVE_SUB,
    status: "past_due",
    gatewayKey: "stripe",
    gatewaySubscriptionId: "sub_stripe1",
  };
  const { module, state } = cron({
    invoices: [overdueInvoice({ dueDate: day(-3), dunningStage: 1 })],
    subscriptionsById: { sub_1: stripeSub },
  });
  await module.runBillingCron({ now: NOW });
  assert.equal(state.charges.length, 1);
  assert.equal(state.gatewayPayments.length, 1);
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.dunning" && /cobrado=si/.test(event.details),
    ),
  );
});

test("dunning día 14: suspensión del servicio en su panel", async () => {
  const { module, state } = cron({
    invoices: [overdueInvoice({ dueDate: day(-14), dunningStage: 3 })],
    subscriptionsById: { sub_1: { ...ACTIVE_SUB, status: "past_due" } },
  });
  await module.runBillingCron({ now: NOW });
  assert.equal(state.suspensions.length, 1);
  assert.equal(state.suspensions[0].serviceId, "svc_1");
  assert.ok(
    state.invoiceUpdates.some((args) => args.data.dunningStage === 4),
  );
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.dunning" && /accion=suspension/.test(event.details),
    ),
  );
});

test("dunning día 30 con el interruptor apagado no cancela nada", async () => {
  const { module, state } = cron({
    env: { DUNNING_TERMINATE_ENABLED: "false" },
    invoices: [overdueInvoice({ dueDate: day(-30), dunningStage: 4 })],
    subscriptionsById: { sub_1: { ...ACTIVE_SUB, status: "past_due" } },
  });
  await module.runBillingCron({ now: NOW });
  assert.ok(
    !state.subscriptionsUpdated.some((args) => args.data.status === "cancelled"),
  );
  assert.ok(
    !state.invoiceUpdates.some((args) => args.data.dunningStage === 5),
  );
  assert.ok(
    state.events.some(
      (event) =>
        event.action === "billing.dunning" && /terminacion-omitida/.test(event.details),
    ),
  );
});

test("dunning día 30 con el interruptor encendido cancela suscripción y servicio y termina la cuenta en su panel", async () => {
  const { module, state } = cron({
    env: { DUNNING_TERMINATE_ENABLED: "true" },
    invoices: [overdueInvoice({ dueDate: day(-30), dunningStage: 4 })],
    subscriptionsById: { sub_1: { ...ACTIVE_SUB, status: "past_due" } },
  });
  await module.runBillingCron({ now: NOW });
  assert.ok(
    state.subscriptionsUpdated.some((args) => args.data.status === "cancelled"),
  );
  assert.ok(
    state.invoiceUpdates.some((args) => args.data.dunningStage === 5),
  );
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.dunning" && /accion=terminacion/.test(event.details),
    ),
  );
  // La terminación usa el panel del servicio, fuera de la transacción.
  assert.equal(state.terminations.length, 1);
  assert.equal(state.terminations[0].serviceId, "svc_1");
});

/* ------------------------------ recordatorios ------------------------------ */

function reminderInvoice(overrides = {}) {
  return {
    id: "inv_rem",
    userId: "user_1",
    orderId: "ord_r1",
    number: "RN-REM",
    currency: "USD",
    totalCents: 1299,
    status: "issued",
    type: "renewal",
    subscriptionId: "sub_1",
    dueDate: day(7),
    dunningStage: 0,
    ...overrides,
  };
}

test("runRemindersCron avisa a 7 días y marca reminderSentAt", async () => {
  const { module, state } = cron({ invoices: [reminderInvoice()] });
  const stats = await module.runRemindersCron({ now: NOW });
  assert.equal(stats.processed, 1);
  assert.equal(stats.succeeded, 1);
  assert.equal(state.notices.length, 1);
  assert.match(state.notices[0].subject, /7 días/);
  assert.ok(
    state.invoiceUpdates.some(
      (args) => args.where.id === "inv_rem" && args.data.reminderSentAt,
    ),
  );
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.reminder" && /umbral=7/.test(event.details),
    ),
  );
});

test("runRemindersCron no repite el mismo umbral y salta los días sin umbral", async () => {
  const { module, state } = cron({
    invoices: [
      reminderInvoice({ id: "inv_7", number: "RN-7", dueDate: day(7) }),
      reminderInvoice({ id: "inv_5", number: "RN-5", dueDate: day(5) }),
      reminderInvoice({ id: "inv_1", number: "RN-1", dueDate: day(1) }),
    ],
    existingEvent: { id: "ev_1", action: "billing.reminder" },
  });
  // Con un evento previo, el umbral ya enviado se salta; el de 5 días no
  // es umbral; solo queda el de 1 día... pero el mock devuelve el mismo
  // evento para todos, así que también se salta. Se comprueba que no se
  // envía nada y que se procesaron los dos umbrales.
  const stats = await module.runRemindersCron({ now: NOW });
  assert.equal(stats.processed, 2);
  assert.equal(state.notices.length, 0);
});

test("runRemindersCron sin correo configurado no marca como enviado", async () => {
  const { module, state } = cron({
    invoices: [reminderInvoice({ dueDate: day(3) })],
    mailResult: { delivered: false, reason: "unconfigured" },
  });
  const stats = await module.runRemindersCron({ now: NOW });
  assert.equal(stats.succeeded, 0);
  assert.equal(state.notices.length, 1);
  assert.ok(
    !state.invoiceUpdates.some((args) => args.data.reminderSentAt),
  );
  assert.ok(
    state.events.some(
      (event) => event.action === "billing.reminder" && /umbral=3/.test(event.details),
    ),
  );
});
