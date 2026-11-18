// Alertas (Fase 6, frente B): raiseAlert solo crea si la regla existe y
// está activa, sanea título y cuerpo, y solo envía correo con SMTP;
// login sin historial no alerta; consumo anormal con dedupe de 24 h.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loader } from "./helpers/load.mjs";

function fakeDb(rules = {}) {
  const state = { alerts: [], sessions: [], invoices: [] };
  const db = {
    state,
    alertRule: {
      findUnique: async ({ where }) => rules[where.key] ?? null,
    },
    alert: {
      create: async ({ data }) => {
        const row = { id: `alert_${state.alerts.length + 1}`, readAt: null, createdAt: new Date(), ...data };
        state.alerts.push(row);
        return row;
      },
      findFirst: async ({ where }) => {
        const since = where.createdAt?.gte;
        return (
          state.alerts.find(
            (row) =>
              row.ruleKey === where.ruleKey &&
              (where.resourceId === undefined || row.resourceId === where.resourceId) &&
              (!since || row.createdAt >= since),
          ) ?? null
        );
      },
    },
    adminSession: {
      findMany: async () => state.sessions,
    },
    customerInvoice: {
      findMany: async () => state.invoices,
    },
  };
  return db;
}

function loadAlerts(db, mail = {}) {
  const calls = { mail: [] };
  const h = loader({
    "./db": { db },
    "./mailer": {
      deliverNotice: async (input) => {
        calls.mail.push(input);
        return { delivered: true, reason: "smtp" };
      },
      mailerConfigured: () => mail.smtp ?? false,
    },
    env: mail.env ?? {},
  });
  return { mod: h.load("lib/alerts.ts"), db, calls };
}

const RULES = {
  "admin.critical_action": { key: "admin.critical_action", active: true },
  "admin.password_changed": { key: "admin.password_changed", active: true },
  "admin.login_suspicious": { key: "admin.login_suspicious", active: true },
  "billing.abnormal_usage": { key: "billing.abnormal_usage", active: true },
  "provision.failed": { key: "provision.failed", active: true },
};

test("raiseAlert crea la alerta de acción crítica con severidad critical", async () => {
  const db = fakeDb(RULES);
  const { mod } = loadAlerts(db);
  const result = await mod.raiseAlert({
    ruleKey: "admin.critical_action",
    severity: "critical",
    title: "Servicio terminado en el panel: svc-1",
    body: "El administrador terminó la cuenta del servicio svc-1.",
    resourceType: "service",
    resourceId: "svc-1",
  });
  assert.equal(result.created, true);
  assert.equal(result.reason, "created");
  assert.equal(db.state.alerts.length, 1);
  assert.equal(db.state.alerts[0].severity, "critical");
  assert.equal(db.state.alerts[0].ruleKey, "admin.critical_action");
  assert.equal(db.state.alerts[0].resourceId, "svc-1");
});

test("raiseAlert no crea nada si la regla no existe o está inactiva", async () => {
  const db = fakeDb({
    "admin.critical_action": { key: "admin.critical_action", active: false },
  });
  const { mod } = loadAlerts(db);
  const inactive = await mod.raiseAlert({
    ruleKey: "admin.critical_action",
    severity: "critical",
    title: "x",
    body: "x",
  });
  assert.equal(inactive.created, false);
  assert.equal(inactive.reason, "rule-inactive");
  const missing = await mod.raiseAlert({
    ruleKey: "regla.inexistente",
    severity: "warning",
    title: "x",
    body: "x",
  });
  assert.equal(missing.created, false);
  assert.equal(missing.reason, "no-rule");
  assert.equal(db.state.alerts.length, 0);
});

test("raiseAlert sanea título y cuerpo, y sin SMTP no envía correo", async () => {
  const db = fakeDb(RULES);
  const { mod, calls } = loadAlerts(db, { smtp: false });
  const result = await mod.raiseAlert({
    ruleKey: "admin.password_changed",
    severity: "warning",
    title: "Contraseña cambiada: admin@example.com",
    body: "La contraseña nueva es password=clave-secreta-123 y el token=tok-secreto.",
    resourceType: "adminUser",
    resourceId: "admin_1",
  });
  assert.equal(result.created, true);
  assert.equal(result.emailed, false);
  assert.equal(calls.mail.length, 0);
  const row = db.state.alerts[0];
  assert.doesNotMatch(row.body, /clave-secreta-123|tok-secreto/);
  assert.match(row.body, /password=\[redacted\]/);
});

test("raiseAlert con SMTP envía el correo al ADMIN_EMAIL con el cuerpo saneado", async () => {
  const db = fakeDb(RULES);
  const { mod, calls } = loadAlerts(db, {
    smtp: true,
    env: { ADMIN_EMAIL: "admin@example.com" },
  });
  const result = await mod.raiseAlert({
    ruleKey: "provision.failed",
    severity: "warning",
    title: "El alta del servicio svc-1 falló",
    body: "El alta falló; la nota trae password=clave-secreta-123.",
    resourceType: "service",
    resourceId: "svc-1",
  });
  assert.equal(result.created, true);
  assert.equal(result.emailed, true);
  assert.equal(calls.mail.length, 1);
  assert.equal(calls.mail[0].to, "admin@example.com");
  assert.match(calls.mail[0].subject, /El alta del servicio svc-1 falló/);
  assert.doesNotMatch(calls.mail[0].text, /clave-secreta-123/);
  assert.match(calls.mail[0].text, /El alta falló; la nota trae password=\[redacted\]/);
});

test("raiseAlert nunca lanza si la base falla", async () => {
  const db = fakeDb(RULES);
  db.alertRule.findUnique = async () => {
    throw new Error("base caída");
  };
  const { mod } = loadAlerts(db);
  const result = await mod.raiseAlert({
    ruleKey: "admin.critical_action",
    severity: "critical",
    title: "x",
    body: "x",
  });
  assert.equal(result.created, false);
  assert.equal(result.reason, "error");
});

test("login sin historial no alerta; con historial e IP distinta sí; con la misma IP no", async () => {
  const db = fakeDb(RULES);
  const { mod } = loadAlerts(db);
  // Sin historial: primer inicio, no es sospechoso por sí solo.
  assert.equal(
    await mod.checkSuspiciousAdminLogin({ adminUserId: "admin_1", email: "admin@example.com", ip: "203.0.113.7" }),
    false,
  );
  assert.equal(db.state.alerts.length, 0);
  // Historial con la misma IP: nada.
  db.state.sessions = [{ ipHash: createHash("sha256").update("203.0.113.7").digest("hex") }];
  assert.equal(
    await mod.checkSuspiciousAdminLogin({ adminUserId: "admin_1", email: "admin@example.com", ip: "203.0.113.7" }),
    false,
  );
  assert.equal(db.state.alerts.length, 0);
  // Historial con otra IP: alerta warning.
  assert.equal(
    await mod.checkSuspiciousAdminLogin({ adminUserId: "admin_1", email: "admin@example.com", ip: "198.51.100.9" }),
    true,
  );
  assert.equal(db.state.alerts.length, 1);
  assert.equal(db.state.alerts[0].ruleKey, "admin.login_suspicious");
  assert.equal(db.state.alerts[0].severity, "warning");
  assert.doesNotMatch(JSON.stringify(db.state.alerts[0]), /198\.51\.100\.9|203\.0\.113\.7/);
  // Sin IP real ("local"): no se compara.
  assert.equal(
    await mod.checkSuspiciousAdminLogin({ adminUserId: "admin_1", email: "admin@example.com", ip: "local" }),
    false,
  );
  assert.equal(db.state.alerts.length, 1);
});

test("consumo anormal: 3 facturas impagas seguidas alertan; con 2 no; y no se repite el mismo día", async () => {
  const db = fakeDb(RULES);
  const { mod } = loadAlerts(db);
  const now = new Date("2026-11-18T12:00:00.000Z");
  const overdue = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `inv_${i}`,
      status: "issued",
      dueDate: new Date(now.getTime() - (i + 1) * 86_400_000),
    }));
  db.state.invoices = overdue(2);
  assert.equal(
    await mod.maybeAlertAbnormalUsage({ serviceId: "svc-1", subscriptionId: "sub-1", now }),
    false,
  );
  assert.equal(db.state.alerts.length, 0);
  db.state.invoices = overdue(3);
  assert.equal(
    await mod.maybeAlertAbnormalUsage({ serviceId: "svc-1", subscriptionId: "sub-1", now }),
    true,
  );
  assert.equal(db.state.alerts.length, 1);
  assert.equal(db.state.alerts[0].ruleKey, "billing.abnormal_usage");
  assert.equal(db.state.alerts[0].severity, "warning");
  // Dedupe de 24 h por servicio: la segunda evaluación del mismo día no crea otra.
  assert.equal(
    await mod.maybeAlertAbnormalUsage({ serviceId: "svc-1", subscriptionId: "sub-1", now }),
    false,
  );
  assert.equal(db.state.alerts.length, 1);
  // Otro servicio sí alerta.
  assert.equal(
    await mod.maybeAlertAbnormalUsage({ serviceId: "svc-2", subscriptionId: "sub-2", now }),
    true,
  );
  assert.equal(db.state.alerts.length, 2);
});

test("consumo anormal: una factura pagada entre las 3 rompe la racha", async () => {
  const db = fakeDb(RULES);
  const { mod } = loadAlerts(db);
  const now = new Date("2026-11-18T12:00:00.000Z");
  db.state.invoices = [
    { id: "inv_1", status: "issued", dueDate: new Date(now.getTime() - 86_400_000) },
    { id: "inv_2", status: "paid", dueDate: new Date(now.getTime() - 2 * 86_400_000) },
    { id: "inv_3", status: "issued", dueDate: new Date(now.getTime() - 3 * 86_400_000) },
  ];
  assert.equal(
    await mod.maybeAlertAbnormalUsage({ serviceId: "svc-1", subscriptionId: "sub-1", now }),
    false,
  );
  assert.equal(db.state.alerts.length, 0);
});
