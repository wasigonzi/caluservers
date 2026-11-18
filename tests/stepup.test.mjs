// Step-up (Fase 6, frente C): confirmación reciente para operaciones
// peligrosas y su enforcement en las rutas de commerce y de usuarios.
// Todos los valores son señuelos locales; la BD es falsa en memoria.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { loader } from "./helpers/load.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function fakeReq(body) {
  return { json: async () => body, headers: { get: () => null } };
}

/** Carga lib/stepup.ts con una BD falsa que registra los updateMany. */
function loadStepUp() {
  const calls = [];
  const db = {
    adminSession: {
      updateMany: async ({ where, data }) => {
        calls.push({ where, data });
        return { count: calls.length <= 2 ? 1 : 0 };
      },
    },
  };
  const h = loader({ "@/lib/db": { db } });
  return { mod: h.load("lib/stepup.ts"), db, calls };
}

/* ------------------------- requireStepUp puro ------------------------- */

test("requireStepUp: sin stepUpAt lanza 403 con código step-up-required", () => {
  const { mod } = loadStepUp();
  const session = { stepUpAt: null };
  assert.throws(
    () => mod.requireStepUp(session),
    (error) => error.status === 403 && error.code === "step-up-required",
  );
  assert.throws(() => mod.requireStepUp(undefined), (error) => error.code === "step-up-required");
});

test("requireStepUp: confirmación de hace 20 minutos está caducada (máx. 15)", () => {
  const { mod } = loadStepUp();
  const old = new Date(Date.now() - 20 * 60 * 1000);
  assert.equal(mod.isStepUpFresh(old), false);
  assert.throws(() => mod.requireStepUp({ stepUpAt: old }), (error) => error.status === 403);
});

test("requireStepUp: confirmación de hace 5 minutos pasa y devuelve la sesión", () => {
  const { mod } = loadStepUp();
  const fresh = new Date(Date.now() - 5 * 60 * 1000);
  assert.equal(mod.isStepUpFresh(fresh), true);
  const session = { stepUpAt: fresh, email: "admin@example.com" };
  assert.equal(mod.requireStepUp(session), session);
});

test("requireStepUp: maxAgeMinutes se respeta (10 min: 11 caduca, 9 pasa)", () => {
  const { mod } = loadStepUp();
  assert.equal(mod.isStepUpFresh(new Date(Date.now() - 11 * 60 * 1000), 10), false);
  assert.equal(mod.isStepUpFresh(new Date(Date.now() - 9 * 60 * 1000), 10), true);
  assert.equal(mod.isStepUpFresh(new Date(Date.now() - 20 * 60 * 1000), 30), true);
});

test("requireStepUp: stepUpAt en el futuro no vale", () => {
  const { mod } = loadStepUp();
  assert.equal(mod.isStepUpFresh(new Date(Date.now() + 60 * 1000)), false);
});

/* ------------------------------ touchStepUp ------------------------------ */

test("touchStepUp por tokenHash marca stepUpAt en la sesión viva", async () => {
  const { mod, calls } = loadStepUp();
  const token = randomBytes(32).toString("base64url");
  const ok = await mod.touchStepUp({ tokenHash: sha256(token) });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.tokenHash, sha256(token));
  assert.equal(calls[0].where.revokedAt, null);
  // `instanceof Date` no vale entre reinos (el módulo corre en un VM):
  // se comprueba por la forma (getTime válido).
  assert.ok(Number.isFinite(calls[0].where.expiresAt.gt.getTime()));
  assert.ok(Number.isFinite(calls[0].data.stepUpAt.getTime()));
});

test("touchStepUp por adminUserId marca sus sesiones y sin identificador no toca nada", async () => {
  const { mod, calls } = loadStepUp();
  const ok = await mod.touchStepUp({ adminUserId: "admin_1" });
  assert.equal(ok, true);
  assert.equal(calls[0].where.adminUserId, "admin_1");
  assert.equal(calls[0].where.tokenHash, undefined);
  const none = await mod.touchStepUp({});
  assert.equal(none, false);
  assert.equal(calls.length, 1);
});

/* ------------------- enforcement en la ruta de commerce ------------------- */

class AuthorizationError extends Error {
  constructor(permission) {
    super("FORBIDDEN");
    this.status = 403;
    this.permission = permission;
  }
}

function commerceSetup({ stepUpAt }) {
  const calls = { terminates: [], refunds: [] };
  const db = {
    customerService: {
      findUnique: async () => ({ id: "svc-1", panelAccountId: "miti1a2b" }),
    },
    payment: {
      findUnique: async () => ({
        id: "pay-1",
        status: "confirmed",
        amountCents: 1000,
        currency: "USD",
        provider: "manual",
        providerRef: null,
      }),
    },
  };
  const h = loader({
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
      requireAdmin: async () => ({
        userId: "admin_1",
        email: "admin@example.com",
        roles: ["owner"],
        permissions: [],
        stepUpAt,
      }),
      requirePermission: async () => ({
        userId: "admin_1",
        email: "admin@example.com",
        roles: ["owner"],
        permissions: ["services:terminate", "payments:confirm"],
        stepUpAt,
      }),
      AuthorizationError,
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/commerce": {
      CommerceError: class CommerceError extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
      confirmManualPayment: async () => ({}),
      markPaymentRefunded: async ({ paymentId }) => {
        calls.refunds.push(paymentId);
        return { id: paymentId, status: "refunded" };
      },
      replyTicket: async () => ({}),
      setServicePanel: async () => ({}),
      setServiceStatus: async () => ({}),
      setTicketStatus: async () => ({}),
      voidInvoice: async () => ({}),
    },
    "@/lib/panels": {
      suspendServicePanel: async () => ({ suspended: true }),
      terminateServicePanel: async ({ serviceId }) => {
        calls.terminates.push(serviceId);
        return { terminated: true, reason: "Cuenta terminada en WHM." };
      },
      unsuspendServicePanel: async () => ({ unsuspended: true }),
    },
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
  return { route: h.load("app/api/admin/commerce/route.ts"), calls };
}

test("commerce: service-terminate sin step-up responde 403 step-up-required y no termina nada", async () => {
  const { route, calls } = commerceSetup({ stepUpAt: null });
  const res = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", confirm: true, note: "el cliente se dio de baja" }),
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "step-up-required");
  assert.match(body.message, /confirmar tu identidad/);
  assert.equal(calls.terminates.length, 0);
});

test("commerce: service-terminate con step-up reciente termina la cuenta", async () => {
  const { route, calls } = commerceSetup({ stepUpAt: new Date(Date.now() - 2 * 60 * 1000) });
  const res = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", confirm: true, note: "el cliente se dio de baja" }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls.terminates, ["svc-1"]);
});

test("commerce: refund-payment sin step-up responde 403 step-up-required y no reembolsa", async () => {
  const { route, calls } = commerceSetup({ stepUpAt: new Date(Date.now() - 30 * 60 * 1000) });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay-1", note: "cobro duplicado por error" }),
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "step-up-required");
  assert.equal(calls.refunds.length, 0);
});

test("commerce: refund-payment con step-up reciente reembolsa el cobro manual", async () => {
  const { route, calls } = commerceSetup({ stepUpAt: new Date() });
  const res = await route.POST(
    fakeReq({ action: "refund-payment", paymentId: "pay-1", note: "cobro duplicado por error" }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls.refunds, ["pay-1"]);
});

/* -------------------- enforcement en la ruta de usuarios -------------------- */

function usersSetup({ stepUpAt }) {
  const calls = { created: [], audit: [] };
  const db = {
    adminUser: {
      count: async () => 1,
      findFirst: async () => null,
      findUnique: async () => null,
      create: async ({ data }) => {
        calls.created.push(data);
        return {
          id: "admin_new",
          email: data.email,
          createdAt: new Date(),
          lastLoginAt: null,
          disabledAt: null,
          mfaRequired: true,
          roles: [{ role: { name: "soporte" } }],
        };
      },
      update: async () => ({}),
    },
    role: {
      findUnique: async ({ where }) => ({ id: `role_${where.name}`, name: where.name }),
    },
    adminSession: { updateMany: async () => ({ count: 0 }) },
    adminAudit: {
      create: async ({ data }) => {
        calls.audit.push(data);
        return data;
      },
    },
  };
  const h = loader({
    "@/lib/db": { db },
    "next/server": {
      NextResponse: class {
        static json(data, init) {
          return new FakeResponse(data, init?.status ?? 200);
        }
      },
      NextRequest: class {},
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/passwords": { hashPassword: async () => "$argon2id$test" },
    "@/lib/auth": {
      requirePermission: async (permission) => {
        if (permission !== "users:manage") throw new AuthorizationError(permission);
        return {
          userId: "admin_self",
          email: "admin@example.com",
          roles: ["owner"],
          permissions: ["users:manage"],
          stepUpAt,
        };
      },
      AuthorizationError,
    },
  });
  return { route: h.load("app/api/admin/users/route.ts"), calls };
}

test("users: crear un admin sin step-up responde 403 step-up-required y no crea nada", async () => {
  const { route, calls } = usersSetup({ stepUpAt: null });
  const res = await route.POST(
    fakeReq({ action: "create", email: "nuevo@example.com", password: "secreto-seguro", role: "soporte" }),
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "step-up-required");
  assert.equal(calls.created.length, 0);
});

test("users: crear un admin con step-up reciente crea el admin con su rol", async () => {
  const { route, calls } = usersSetup({ stepUpAt: new Date(Date.now() - 60 * 1000) });
  const res = await route.POST(
    fakeReq({ action: "create", email: "nuevo@example.com", password: "secreto-seguro", role: "soporte" }),
  );
  assert.equal(res.status, 201);
  assert.equal(calls.created.length, 1);
  assert.equal((await res.json()).user.email, "nuevo@example.com");
});
