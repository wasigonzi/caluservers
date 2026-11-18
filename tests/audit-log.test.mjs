// Auditoría unificada (Fase 6, frente B): writeAuditLog hashea la IP,
// sanea los details y nunca lanza; la doble escritura deja la fila en
// AuditLog sin borrar la vieja (AdminAudit / CommerceEvent se conservan).
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loader } from "./helpers/load.mjs";

function fakeDb() {
  const state = { auditLog: [], adminAudit: [], events: [] };
  const db = {
    state,
    auditLog: {
      create: async ({ data }) => {
        const row = { id: `audit_${state.auditLog.length + 1}`, createdAt: new Date(), ...data };
        state.auditLog.push(row);
        return row;
      },
    },
    adminAudit: {
      create: async ({ data }) => {
        const row = { id: `admin_${state.adminAudit.length + 1}`, createdAt: new Date(), ...data };
        state.adminAudit.push(row);
        return row;
      },
    },
    commerceEvent: {
      create: async ({ data }) => {
        const row = { id: `evt_${state.events.length + 1}`, createdAt: new Date(), ...data };
        state.events.push(row);
        return row;
      },
    },
    catalogConfig: {
      upsert: async () => ({ id: "default" }),
    },
    $transaction: async (fn) => fn(db),
  };
  return db;
}

function loadAuditLog(db) {
  const h = loader({ "./db": { db } });
  return { mod: h.load("lib/audit-log.ts"), db };
}

test("writeAuditLog guarda la IP solo como hash SHA-256, nunca en claro", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  await mod.writeAuditLog({
    actorType: "admin",
    actorId: "admin@example.com",
    action: "admin.login",
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0",
    details: "inicio de sesión correcto",
  });
  assert.equal(db.state.auditLog.length, 1);
  const row = db.state.auditLog[0];
  assert.equal(row.ipHash, createHash("sha256").update("203.0.113.7").digest("hex"));
  assert.doesNotMatch(JSON.stringify(row), /203\.0\.113\.7/);
  assert.equal(row.userAgent, "Mozilla/5.0");
  assert.equal(row.actorType, "admin");
});

test("writeAuditLog redacta o elimina password, token y secret de los details", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  await mod.writeAuditLog({
    actorType: "admin",
    actorId: "admin@example.com",
    action: "admin.password_changed",
    details: {
      action: "admin.password_changed",
      actor: "admin@example.com",
      password: "secreto-123",
      token: "tok-secreto",
      secret: "s3cr3t",
      reason: "cambio desde el panel",
    },
  });
  const row = db.state.auditLog[0];
  assert.doesNotMatch(row.details, /secreto-123|tok-secreto|s3cr3t/);
  assert.match(row.details, /cambio desde el panel/);
  assert.match(row.details, /admin\.password_changed/);

  await mod.writeAuditLog({
    actorType: "system",
    action: "test",
    details: "nota interna password=clave-secreta; todo bien",
  });
  assert.doesNotMatch(db.state.auditLog[1].details, /clave-secreta/);
  assert.match(db.state.auditLog[1].details, /password=\[redacted\]/);
});

test("writeAuditLog nunca lanza si la base falla", async () => {
  const db = fakeDb();
  db.auditLog.create = async () => {
    throw new Error("base caída");
  };
  const { mod } = loadAuditLog(db);
  await mod.writeAuditLog({ actorType: "admin", action: "test" });
});

test("writeAuditLogTx escribe en la transacción y no lanza sin auditLog en el tx", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  const tx = {
    auditLog: {
      create: async ({ data }) => {
        db.state.auditLog.push({ id: "tx_1", ...data });
        return data;
      },
    },
  };
  await mod.writeAuditLogTx(tx, { actorType: "client", actorId: "user_1", action: "order.created" });
  assert.equal(db.state.auditLog.length, 1);
  assert.equal(db.state.auditLog[0].action, "order.created");
  // Doble de transacción sin la tabla: no hace nada y no lanza.
  await mod.writeAuditLogTx({}, { actorType: "client", action: "order.created" });
  await mod.writeAuditLogTx(
    { auditLog: { create: async () => { throw new Error("tx rota"); } } },
    { actorType: "client", action: "order.created" },
  );
  assert.equal(db.state.auditLog.length, 1);
});

test("doble escritura: commitCatalog deja la fila vieja en AdminAudit y crea la de AuditLog", async () => {
  const db = fakeDb();
  const h = loader({ "./db": { db } });
  const writes = h.load("lib/writes.ts");
  await writes.commitCatalog({ planes: [] }, "catalog.updated", "catálogo actualizado");
  assert.equal(db.state.adminAudit.length, 1);
  assert.equal(db.state.adminAudit[0].action, "catalog.updated");
  assert.equal(db.state.auditLog.length, 1);
  assert.equal(db.state.auditLog[0].action, "catalog.updated");
  assert.equal(db.state.auditLog[0].actorType, "admin");
});

test("la auditoría pagina de 50 en 50, igual en la página y en la API", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  assert.equal(mod.AUDIT_LOG_PAGE_SIZE, 50);
});

test("actorTypeFor clasifica sistema, admin por correo y cliente por id", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  assert.equal(mod.actorTypeFor("billing-cron"), "system");
  assert.equal(mod.actorTypeFor("stripe"), "system");
  assert.equal(mod.actorTypeFor("admin@example.com"), "admin");
  assert.equal(mod.actorTypeFor("user_123"), "client");
});

test("buildAuditLogWhere: actor inválido y fechas inválidas se ignoran; recurso busca en tipo o id", async () => {
  const db = fakeDb();
  const { mod } = loadAuditLog(db);
  const where = mod.buildAuditLogWhere({
    actorType: "intruso",
    action: "payment",
    resource: "svc-1",
    from: "no-fecha",
    to: "2026-11-18",
  });
  assert.equal(where.actorType, undefined);
  assert.equal(where.action.contains, "payment");
  assert.equal(where.action.mode, "insensitive");
  assert.equal(where.OR.length, 2);
  assert.equal(where.OR[0].resourceType.contains, "svc-1");
  assert.equal(where.OR[1].resourceId.contains, "svc-1");
  assert.equal(where.createdAt.gte, undefined);
  assert.equal(where.createdAt.lte.toISOString(), "2026-11-18T23:59:59.999Z");
  const empty = mod.buildAuditLogWhere({});
  assert.equal(Object.keys(empty).length, 0);
});
