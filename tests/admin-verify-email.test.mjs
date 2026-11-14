// Marcar el correo de un cliente como verificado (admin). Sin SMTP: no se envía
// ningún correo, solo se marca el indicador para desbloquear el acceso.
// Tokens y credenciales de estas pruebas son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const ADMIN = "admin@example.com";

function fakeDb(users = {}) {
  const store = new Map(
    Object.entries(users).map(([id, row]) => [id, { id, email: `${id}@example.com`, emailVerified: false, ...row }]),
  );
  const state = { audits: [], updates: [] };
  const db = {
    user: {
      findUnique: async ({ where }) => store.get(where.id) ?? null,
      update: async ({ where, data, select }) => {
        const row = store.get(where.id);
        if (!row) {
          const error = new Error("No se encontró el registro.");
          error.code = "P2025";
          throw error;
        }
        const next = { ...row, ...data };
        store.set(where.id, next);
        state.updates.push(next);
        if (!select) return next;
        return Object.fromEntries(Object.entries(next).filter(([key]) => select[key]));
      },
    },
    adminAudit: {
      create: async ({ data }) => {
        state.audits.push(data);
        return data;
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return { db, state, store };
}

function commerceModule(users) {
  const { db, state, store } = fakeDb(users);
  const h = loader({ "./db": { db }, "@/lib/db": { db } });
  return { commerce: h.load("lib/commerce.ts"), state, store };
}

test("un cliente sin verificar queda verificado y queda constancia en el diario", async () => {
  const { commerce, state } = commerceModule({ "user-1": { email: "cliente@example.com" } });
  const result = await commerce.markEmailVerified({ actor: ADMIN, userId: "user-1" });
  assert.equal(result.id, "user-1");
  assert.equal(result.email, "cliente@example.com");
  assert.equal(result.emailVerified, true);
  assert.equal(state.updates.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "customer.email.verified");
  assert.equal(state.audits[0].entityId, "user-1");
  assert.ok(state.audits[0].details.includes(ADMIN));
  assert.ok(state.audits[0].details.includes("cliente@example.com"));
});

test("un cliente que ya estaba verificado se acepta sin romper nada", async () => {
  const { commerce, state } = commerceModule({
    "user-1": { email: "cliente@example.com", emailVerified: true },
  });
  const result = await commerce.markEmailVerified({ actor: ADMIN, userId: "user-1" });
  assert.equal(result.emailVerified, true);
  assert.equal(state.audits.length, 1);
});

test("un cliente que no existe se rechaza con 404 y no escribe nada", async () => {
  const { commerce, state } = commerceModule({ "user-1": {} });
  await assert.rejects(
    () => commerce.markEmailVerified({ actor: ADMIN, userId: "user-9" }),
    (error) => error.name === "CommerceError" && error.status === 404,
  );
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
});

test("sin userId se rechaza con 400", async () => {
  const { commerce, state } = commerceModule({ "user-1": {} });
  for (const userId of ["", "   "]) {
    await assert.rejects(
      () => commerce.markEmailVerified({ actor: ADMIN, userId }),
      (error) => error.name === "CommerceError" && error.status === 400,
      JSON.stringify(userId),
    );
  }
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
});

/* ------------------------------ la ruta ------------------------------ */

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status;
  }
  async json() {
    return this.body;
  }
}

function routeModule({ admin = true, trusted = true, users } = {}) {
  const { db, state } = fakeDb(users);
  const h = loader({
    "./db": { db },
    "@/lib/db": { db },
    "next/server": {
      NextResponse: class {
        static json(data, init) {
          return new FakeResponse(data, init?.status ?? 200);
        }
      },
      NextRequest: class {},
    },
    "@/lib/auth": {
      requireAdmin: async () => {
        if (!admin) throw new Error("UNAUTHORIZED");
      },
    },
    "@/lib/request": { trustedWrite: () => trusted },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/whm-security": {
      WhmError: class WhmError extends Error {},
      safeWhmError: () => ({ message: "whm", code: "x" }),
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async () => ({ provisioned: false }),
      ProvisionError: class ProvisionError extends Error {
        constructor(message, code) {
          super(message);
          this.code = code;
        }
      },
      provisionService: async () => ({}),
    },
  });
  const route = h.load("app/api/admin/commerce/route.ts");
  return { route, state };
}

function fakeReq(body) {
  return { json: async () => body, headers: { get: () => null } };
}

test("la ruta exige admin: sin sesión responde 401", async () => {
  const { route } = routeModule({ admin: false, users: { "user-1": {} } });
  const res = await route.POST(fakeReq({ action: "verify-email", userId: "user-1" }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "Unauthorized");
});

test("la ruta exige origen de confianza: sin él responde 403", async () => {
  const { route } = routeModule({ trusted: false, users: { "user-1": {} } });
  const res = await route.POST(fakeReq({ action: "verify-email", userId: "user-1" }));
  assert.equal(res.status, 403);
});

test("la ruta marca verificado y devuelve id, correo y estado", async () => {
  const { route, state } = routeModule({ users: { "user-1": { email: "cliente@example.com" } } });
  const res = await route.POST(fakeReq({ action: "verify-email", userId: "user-1" }));
  assert.equal(res.status, 200);
  // Comparación por campos: el cuerpo viene del contexto VM del cargador y su
  // prototipo no es el del realm de la prueba (deepEqual lo rechazaría).
  const body = await res.json();
  assert.equal(body.id, "user-1");
  assert.equal(body.email, "cliente@example.com");
  assert.equal(body.emailVerified, true);
  assert.equal(state.audits.length, 1);
});

test("la ruta responde 404 en español para un cliente que no existe", async () => {
  const { route } = routeModule({ users: { "user-1": {} } });
  const res = await route.POST(fakeReq({ action: "verify-email", userId: "user-9" }));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Cliente no encontrado.");
});
