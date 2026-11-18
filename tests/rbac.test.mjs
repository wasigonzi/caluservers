// RBAC (Fase 1, tramo D): matriz por rol sobre la ruta de commerce y la
// gestión de admins. El auth es REAL (lib/auth.ts con BD mockeada, como
// tests/admin-session.test.mjs); la lógica de negocio es señuelo.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { loader } from "./helpers/load.mjs";

const COOKIE = "caluservers_admin_session";
const ADMIN_EMAIL = "admin@example.com";

const ALL_PERMISSIONS = [
  "orders:view",
  "orders:confirm",
  "services:view",
  "services:provision",
  "services:suspend",
  "tickets:view",
  "tickets:reply",
  "clients:view",
  "catalog:write",
  "content:write",
  "appearance:write",
  "settings:write",
  "whm:read",
  "whm:write",
  "users:manage",
  "roles:manage",
  "audit:view",
  "payments:confirm",
];

// Permisos sembrados por la migración 20261118010000_admin_identity_rbac.
const ROLE_PERMISSIONS = {
  owner: [...ALL_PERMISSIONS],
  admin: ALL_PERMISSIONS.filter((p) => p !== "roles:manage"),
  soporte: [
    "tickets:view",
    "tickets:reply",
    "clients:view",
    "orders:view",
    "services:view",
    "audit:view",
  ],
  // Rol inventado para el caso de solo lectura: solo escribe el catálogo.
  catalogo: ["catalog:write"],
};

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

function adminUserRow(role, permissions) {
  return {
    id: `admin_${role}`,
    email: ADMIN_EMAIL,
    passwordHash: "x",
    disabledAt: null,
    roles: [
      {
        role: {
          name: role,
          permissions: permissions.map((key) => ({ permission: { key } })),
        },
      },
    ],
  };
}

function sessionRow(token, adminUser) {
  return {
    id: "sess_1",
    adminUserId: adminUser ? adminUser.id : null,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
    lastSeenAt: new Date(),
    revokedAt: null,
    stepUpAt: null,
    adminUser,
  };
}

/** Carga la ruta de commerce con el auth real y la BD mockeada. */
function commerceSetup({ role = "owner", cookie = true } = {}) {
  const token = randomBytes(32).toString("base64url");
  const permissions = ROLE_PERMISSIONS[role];
  const user = adminUserRow(role, permissions);
  const session = sessionRow(token, user);
  const calls = { audit: [], commerce: [], messages: [] };
  const db = {
    adminUser: {
      findFirst: async () => ({ ...user }),
      update: async () => ({}),
      count: async () => 1,
    },
    adminSession: {
      findUnique: async ({ where }) =>
        where.tokenHash === session.tokenHash ? { ...session } : null,
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    adminAudit: {
      create: async ({ data }) => {
        calls.audit.push(data);
        return data;
      },
    },
    contactMessage: {
      findUnique: async () => ({ id: "msg-1" }),
      update: async ({ data }) => {
        calls.messages.push(data);
        return { id: "msg-1", status: data.status };
      },
    },
  };
  const h = loader({
    "@/lib/db": { db },
    "next/headers": {
      cookies: async () => ({
        get: (name) =>
          name === COOKIE && cookie ? { value: token } : undefined,
      }),
    },
    "next/server": {
      NextResponse: class {
        static json(data, init) {
          return new FakeResponse(data, init?.status ?? 200);
        }
      },
      NextRequest: class {},
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/whm-security": {
      WhmError: class WhmError extends Error {},
      safeWhmError: () => ({ message: "whm", code: "x" }),
    },
    "@/lib/commerce": {
      CommerceError: class CommerceError extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
      confirmManualPayment: async () => {
        calls.commerce.push("confirm-payment");
        return { id: "pay_1", invoiceId: "inv_1", status: "confirmed", amountCents: 399, currency: "USD" };
      },
      setServiceStatus: async ({ status }) => {
        calls.commerce.push("service-status");
        return { id: "svc-1", status, cpanelUser: null };
      },
      voidInvoice: async () => {
        calls.commerce.push("void-invoice");
        return { id: "inv_1", status: "void" };
      },
      setTicketStatus: async ({ status }) => {
        calls.commerce.push("ticket-status");
        return { id: "t_1", status };
      },
      replyTicket: async () => {
        calls.commerce.push("reply-ticket");
        return { id: "msg_1" };
      },
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async () => ({ provisioned: false }),
      ProvisionError: class ProvisionError extends Error {
        constructor(message, code) {
          super(message);
          this.code = code;
        }
      },
      provisionService: async () => {
        calls.commerce.push("provision-service");
        return { ok: true };
      },
      suspendServiceAccount: async () => ({ attempted: false, suspended: false, reason: "" }),
    },
    env: { ADMIN_EMAIL },
  });
  const route = h.load("app/api/admin/commerce/route.ts");
  return { route, calls };
}

const ACTIONS = [
  { action: "confirm-payment", body: { invoiceId: "inv_1" }, permission: "payments:confirm" },
  { action: "service-status", body: { serviceId: "svc-1", status: "active" }, permission: "services:suspend" },
  { action: "void-invoice", body: { invoiceId: "inv_1" }, permission: "payments:confirm" },
  { action: "ticket-status", body: { ticketId: "t_1", status: "closed" }, permission: "tickets:reply" },
  { action: "provision-service", body: { serviceId: "svc-1" }, permission: "services:provision" },
  { action: "reply-ticket", body: { ticketId: "t_1", body: "hola" }, permission: "tickets:reply" },
  { action: "message-status", body: { messageId: "msg-1", status: "read" }, permission: "tickets:view" },
];

for (const role of ["owner", "admin", "soporte"]) {
  test(`matriz commerce: ${role} solo pasa las acciones de sus permisos`, async () => {
    const { route, calls } = commerceSetup({ role });
    const allowed = ROLE_PERMISSIONS[role];
    for (const item of ACTIONS) {
      const before = calls.audit.length;
      const res = await route.POST(fakeReq({ action: item.action, ...item.body }));
      if (allowed.includes(item.permission)) {
        assert.equal(res.status, 200, `${role} debería pasar ${item.action}`);
        assert.equal(calls.audit.length, before, `${role}/${item.action} no audita denegación`);
      } else {
        assert.equal(res.status, 403, `${role} no debería pasar ${item.action}`);
        assert.equal(calls.audit.length, before + 1, `${role}/${item.action} audita la denegación`);
        const denied = calls.audit[calls.audit.length - 1];
        assert.equal(denied.action, "authz.denied");
        assert.match(denied.details, new RegExp(item.permission));
        assert.ok(!calls.commerce.includes(item.action), `${item.action} no se ejecuta sin permiso`);
      }
    }
  });
}

test("soporte sin payments:confirm no confirma el pago: 403 + evento authz.denied", async () => {
  const { route, calls } = commerceSetup({ role: "soporte" });
  const res = await route.POST(fakeReq({ action: "confirm-payment", invoiceId: "inv_1" }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "Sin permiso para esta acción.");
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].action, "authz.denied");
  assert.match(calls.audit[0].details, /payments:confirm/);
  assert.equal(calls.commerce.length, 0);
});

test("soporte con tickets:reply responde el ticket y cambia su estado", async () => {
  const { route, calls } = commerceSetup({ role: "soporte" });
  const reply = await route.POST(fakeReq({ action: "reply-ticket", ticketId: "t_1", body: "hola" }));
  assert.equal(reply.status, 200);
  const status = await route.POST(fakeReq({ action: "ticket-status", ticketId: "t_1", status: "closed" }));
  assert.equal(status.status, 200);
  assert.equal((await status.json()).status, "closed");
  assert.equal(calls.audit.length, 0);
});

test("usuario sin tickets:view en una ruta de solo lectura (message-status): 403", async () => {
  const { route, calls } = commerceSetup({ role: "catalogo" });
  const res = await route.POST(fakeReq({ action: "message-status", messageId: "msg-1", status: "read" }));
  assert.equal(res.status, 403);
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].action, "authz.denied");
  assert.match(calls.audit[0].details, /tickets:view/);
  assert.equal(calls.messages.length, 0);
});

test("sin sesión, commerce responde 401 sin auditar denegación", async () => {
  const { route, calls } = commerceSetup({ role: "owner", cookie: false });
  const res = await route.POST(fakeReq({ action: "confirm-payment", invoiceId: "inv_1" }));
  assert.equal(res.status, 401);
  assert.equal(calls.audit.length, 0);
  assert.equal(calls.commerce.length, 0);
});

/* ------------------------- gestión de admins ------------------------- */

function usersSetup({ roles = ["owner"], permissions = ["users:manage"], adminCount = 1 } = {}) {
  const calls = { created: [], updated: [], sessionsRevoked: [], audit: [], hashed: [] };
  const ownerRow = {
    id: "admin_owner",
    email: "owner@example.com",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastLoginAt: null,
    disabledAt: null,
    mfaRequired: true,
    roles: [{ role: { name: "owner" } }],
  };
  const db = {
    adminUser: {
      count: async (args) => {
        // Conteo de owners habilitados (disable) o total (create).
        if (args?.where?.roles) return 1;
        return adminCount;
      },
      findFirst: async () => null,
      findUnique: async ({ where }) => {
        if (where.id === "admin_owner") return { ...ownerRow };
        if (where.id === "admin_self")
          return { ...ownerRow, id: "admin_self", email: "admin@example.com" };
        return null;
      },
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
      update: async ({ where, data }) => {
        calls.updated.push({ where, data });
        return { ...ownerRow, ...data };
      },
    },
    role: {
      findUnique: async ({ where }) =>
        ["owner", "admin", "soporte"].includes(where.name)
          ? { id: `role_${where.name}`, name: where.name }
          : null,
    },
    adminSession: {
      updateMany: async (args) => {
        calls.sessionsRevoked.push(args);
        return { count: 1 };
      },
    },
    adminAudit: {
      create: async ({ data }) => {
        calls.audit.push(data);
        return data;
      },
    },
  };
  class AuthorizationError extends Error {
    constructor(permission) {
      super("FORBIDDEN");
      this.status = 403;
      this.permission = permission;
    }
  }
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
    "@/lib/passwords": {
      hashPassword: async (password) => {
        calls.hashed.push(password);
        return "$argon2id$test";
      },
    },
    "@/lib/auth": {
      requirePermission: async (permission) => {
        if (!permissions.includes(permission)) throw new AuthorizationError(permission);
        return {
          userId: "admin_self",
          email: "admin@example.com",
          roles,
          permissions,
          // Step-up reciente: estas pruebas cubren la gestión de usuarios,
          // no el step-up (ver tests/stepup.test.mjs para el 403).
          stepUpAt: new Date(),
        };
      },
      AuthorizationError,
    },
  });
  const route = h.load("app/api/admin/users/route.ts");
  return { route, calls };
}

test("users: un owner crea un admin con rol soporte y hash Argon2id, sin devolver el hash", async () => {
  const { route, calls } = usersSetup({});
  const res = await route.POST(
    fakeReq({ action: "create", email: "Soporte@Example.com", password: "secreto-seguro", role: "soporte" }),
  );
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.user.email, "soporte@example.com");
  assert.equal(body.user.roles.join(","), "soporte");
  assert.equal(body.user.passwordHash, undefined);
  assert.equal(calls.hashed.length, 1);
  assert.equal(calls.hashed[0], "secreto-seguro");
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].passwordHash, "$argon2id$test");
  assert.equal(calls.audit[0].action, "admin.user_created");
});

test("users: un admin sin rol owner no puede asignar el rol owner", async () => {
  const { route, calls } = usersSetup({
    roles: ["admin"],
    permissions: ALL_PERMISSIONS.filter((p) => p !== "roles:manage"),
  });
  const res = await route.POST(
    fakeReq({ action: "create", email: "otro@example.com", password: "secreto-seguro", role: "owner" }),
  );
  assert.equal(res.status, 403);
  assert.equal(calls.created.length, 0);
});

test("users: sin users:manage, listar y crear responden 403", async () => {
  const { route } = usersSetup({ roles: ["soporte"], permissions: ["tickets:view"] });
  const list = await route.GET();
  assert.equal(list.status, 403);
  const created = await route.POST(
    fakeReq({ action: "create", email: "x@example.com", password: "secreto-seguro", role: "soporte" }),
  );
  assert.equal(created.status, 403);
});

test("users: sin admins en BD, crear responde 409 y remite al script de migración", async () => {
  const { route, calls } = usersSetup({ adminCount: 0 });
  const res = await route.POST(
    fakeReq({ action: "create", email: "x@example.com", password: "secreto-seguro", role: "soporte" }),
  );
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /admin-migrate/);
  assert.equal(calls.created.length, 0);
});

test("users: deshabilitar al último owner habilitado se rechaza con 409", async () => {
  const { route, calls } = usersSetup({});
  const res = await route.POST(fakeReq({ action: "disable", userId: "admin_owner" }));
  assert.equal(res.status, 409);
  assert.equal(calls.updated.length, 0);
  assert.equal(calls.sessionsRevoked.length, 0);
});

test("users: deshabilitarse a uno mismo se rechaza con 409", async () => {
  const { route, calls } = usersSetup({});
  const res = await route.POST(fakeReq({ action: "disable", userId: "admin_self" }));
  assert.equal(res.status, 409);
  assert.equal(calls.updated.length, 0);
});
