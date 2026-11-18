// Acciones de gestión de servicios en el panel: reactivar un servicio
// cancelado, cancelar uno activo (que además marca su suscripción como
// cancelled y suspende la cuenta en SU panel), suspender/reactivar/terminar
// la cuenta en el panel, cambiar el panel del servicio, y rechazos de la
// ruta (sin admin, sin origen de confianza, servicio inexistente, sin
// confirmación para terminar).
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

function fakeDb(service) {
  const store = service ? { ...service } : null;
  const state = {
    events: [],
    updates: [],
    panelSuspends: [],
    panelUnsuspends: [],
    panelTerminates: [],
    subscriptionCancels: [],
  };
  const db = {
    customerService: {
      findUnique: async () => (store ? { ...store } : null),
      update: async ({ where, data }) => {
        if (!store) {
          const error = new Error("No se encontró el registro.");
          error.code = "P2025";
          throw error;
        }
        Object.assign(store, data);
        state.updates.push({ ...store });
        return { ...store };
      },
    },
    subscription: {
      updateMany: async ({ where, data }) => {
        state.subscriptionCancels.push({ where, data });
        return { count: 1 };
      },
    },
    commerceEvent: {
      create: async ({ data }) => {
        state.events.push(data);
        return data;
      },
    },
    $transaction: async (fn) => fn(db),
  };
  return { db, state, store: () => store };
}

function paidService(status) {
  return {
    id: "svc-1",
    status,
    panelKey: "whm",
    panelAccountId: null,
    cpanelUser: null,
    updatedAt: new Date(Date.now() - 3600_000),
    order: { invoice: { payment: { status: "confirmed" } } },
  };
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

function routeModule({ admin = true, trusted = true, service, permissions, panels } = {}) {
  const { db, state } = fakeDb(service);
  // Permisos de la sesión simulada: por defecto, todos (owner). Los tests
  // RBAC de tests/rbac.test.mjs cubren la matriz por rol con el auth real.
  const sessionPermissions =
    permissions ??
    [
      "orders:view",
      "orders:confirm",
      "services:view",
      "services:provision",
      "services:suspend",
      "services:terminate",
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
  class AuthorizationError extends Error {
    constructor(permission) {
      super("FORBIDDEN");
      this.status = 403;
      this.permission = permission;
    }
  }
  const panelMocks = {
    suspendServicePanel: async ({ serviceId }) => {
      state.panelSuspends.push(serviceId);
      if (panels?.suspendThrows) throw new Error("panel caído");
      return (
        panels?.suspend ??
        { attempted: true, suspended: true, reason: "Cuenta cPanel miti1a2b suspendida en WHM." }
      );
    },
    unsuspendServicePanel: async ({ serviceId }) => {
      state.panelUnsuspends.push(serviceId);
      return (
        panels?.unsuspend ??
        { attempted: true, unsuspended: true, reason: "Cuenta cPanel miti1a2b reactivada en WHM." }
      );
    },
    terminateServicePanel: async ({ serviceId }) => {
      state.panelTerminates.push(serviceId);
      return (
        panels?.terminate ??
        { attempted: true, terminated: true, reason: "Cuenta cPanel miti1a2b terminada en WHM." }
      );
    },
  };
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
      requirePermission: async (permission) => {
        if (!admin) throw new Error("UNAUTHORIZED");
        if (!sessionPermissions.includes(permission)) {
          throw new AuthorizationError(permission);
        }
        return {
          userId: "admin_1",
          email: "admin@example.com",
          roles: ["owner"],
          permissions: sessionPermissions,
          // Step-up reciente: estas pruebas cubren la acción en sí, no el
          // step-up (ver tests/stepup.test.mjs para el 403).
          stepUpAt: new Date(),
        };
      },
      AuthorizationError,
    },
    "@/lib/request": { trustedWrite: () => trusted },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/panels": panelMocks,
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

const REACTIVATE = {
  action: "service-status",
  serviceId: "svc-1",
  status: "active",
  note: "el cliente retomó el servicio",
};

test("la ruta reactiva un servicio cancelado y deja constancia", async () => {
  const { route, state } = routeModule({ service: paidService("cancelled") });
  const res = await route.POST(fakeReq(REACTIVATE));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, "svc-1");
  assert.equal(body.status, "active");
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].status, "active");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].action, "service.status");
  assert.equal(state.events[0].details, "cancelled->active");
});

test("la ruta cancela un servicio activo y marca su suscripción como cancelled", async () => {
  const { route, state } = routeModule({ service: paidService("active") });
  const res = await route.POST(
    fakeReq({ action: "service-status", serviceId: "svc-1", status: "cancelled", note: "baja pedida por el cliente" }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "cancelled");
  assert.equal(state.events[0].details, "active->cancelled");
  // La suscripción queda cancelled para que el cron no genere más renovaciones.
  assert.equal(state.subscriptionCancels.length, 1);
  assert.equal(state.subscriptionCancels[0].where.serviceId, "svc-1");
  assert.equal(state.subscriptionCancels[0].data.status, "cancelled");
  // Sin cuenta en ningún panel no hay nada que suspender.
  assert.equal(state.panelSuspends.length, 0);
});

test("la ruta cancela un servicio con cuenta cPanel e intenta suspenderla en su panel", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
  });
  const res = await route.POST(
    fakeReq({ action: "service-status", serviceId: "svc-1", status: "cancelled", note: "baja pedida por el cliente" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "cancelled");
  assert.equal(body.suspended, true);
  assert.match(body.suspendNote, /suspendida/);
  assert.deepEqual(state.panelSuspends, ["svc-1"]);
});

test("si el panel falla al cancelar, la cancelación en BD NO se deshace", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
    panels: {
      suspend: { attempted: true, suspended: false, reason: "La cuenta cPanel miti1a2b NO se suspendió en WHM (rejected): sigue activa." },
    },
  });
  const res = await route.POST(
    fakeReq({ action: "service-status", serviceId: "svc-1", status: "cancelled", note: "baja pedida por el cliente" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "cancelled");
  assert.equal(body.suspended, false);
  assert.match(body.suspendNote, /NO se suspendió/);
  // La cancelación y la suscripción cancelled quedaron guardadas igual.
  assert.equal(state.updates[0].status, "cancelled");
  assert.equal(state.subscriptionCancels.length, 1);
});

test("si el panel lanza al cancelar, la cancelación en BD NO se deshace", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
    panels: { suspendThrows: true },
  });
  const res = await route.POST(
    fakeReq({ action: "service-status", serviceId: "svc-1", status: "cancelled", note: "baja pedida por el cliente" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "cancelled");
  assert.equal(body.suspended, false);
  assert.match(body.suspendNote, /No se pudo intentar la suspensión/);
  assert.equal(state.updates[0].status, "cancelled");
  assert.equal(state.subscriptionCancels.length, 1);
});

test("service-unsuspend reactiva la cuenta en el panel con nota", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
  });
  const res = await route.POST(
    fakeReq({ action: "service-unsuspend", serviceId: "svc-1", note: "el cliente pagó lo pendiente" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.unsuspended, true);
  assert.match(body.unsuspendNote, /reactivada/);
  assert.deepEqual(state.panelUnsuspends, ["svc-1"]);
  // No cambia el estado del servicio en base.
  assert.equal(state.updates.length, 0);
});

test("service-unsuspend exige nota de al menos 8 caracteres", async () => {
  const { route } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
  });
  const res = await route.POST(
    fakeReq({ action: "service-unsuspend", serviceId: "svc-1", note: "corto" }),
  );
  assert.equal(res.status, 400);
});

test("service-terminate exige confirmación explícita y nota", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
  });
  const noConfirm = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", note: "el cliente se dio de baja" }),
  );
  assert.equal(noConfirm.status, 400);
  assert.equal(state.panelTerminates.length, 0);
  const shortNote = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", confirm: true, note: "corto" }),
  );
  assert.equal(shortNote.status, 400);
  assert.equal(state.panelTerminates.length, 0);
  const ok = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", confirm: true, note: "el cliente se dio de baja" }),
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.terminated, true);
  assert.match(body.terminateNote, /terminada/);
  assert.deepEqual(state.panelTerminates, ["svc-1"]);
});

test("service-terminate sin permiso services:terminate responde 403", async () => {
  const { route, state } = routeModule({
    service: { ...paidService("active"), cpanelUser: "miti1a2b" },
    permissions: [
      "orders:view",
      "services:view",
      "services:provision",
      "services:suspend",
    ],
  });
  const res = await route.POST(
    fakeReq({ action: "service-terminate", serviceId: "svc-1", confirm: true, note: "el cliente se dio de baja" }),
  );
  assert.equal(res.status, 403);
  assert.equal(state.panelTerminates.length, 0);
});

test("service-panel cambia el panel del servicio con nota y auditoría", async () => {
  const { route, state } = routeModule({ service: paidService("active") });
  const res = await route.POST(
    fakeReq({ action: "service-panel", serviceId: "svc-1", panelKey: "plesk", note: "migración al servidor Plesk" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.panelKey, "plesk");
  assert.equal(state.updates[0].panelKey, "plesk");
  assert.equal(state.events[0].action, "service.panel");
  assert.equal(state.events[0].details, "whm->plesk");
});

test("service-panel rechaza un panel inválido y el mismo panel", async () => {
  const { route } = routeModule({ service: paidService("active") });
  const invalid = await route.POST(
    fakeReq({ action: "service-panel", serviceId: "svc-1", panelKey: "cpanelX", note: "migración al servidor nuevo" }),
  );
  assert.equal(invalid.status, 400);
  const same = await route.POST(
    fakeReq({ action: "service-panel", serviceId: "svc-1", panelKey: "whm", note: "migración al servidor nuevo" }),
  );
  assert.equal(same.status, 409);
});

test("reactivar un servicio ya activo se rechaza con 409", async () => {
  const { route } = routeModule({ service: paidService("active") });
  const res = await route.POST(fakeReq(REACTIVATE));
  assert.equal(res.status, 409);
  assert.equal(
    (await res.json()).error,
    "Solo un servicio pendiente de alta o cancelado puede activarse.",
  );
});

test("la ruta exige admin: sin sesión responde 401", async () => {
  const { route } = routeModule({ admin: false, service: paidService("cancelled") });
  const res = await route.POST(fakeReq(REACTIVATE));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "Unauthorized");
});

test("la ruta exige origen de confianza: sin él responde 403", async () => {
  const { route } = routeModule({ trusted: false, service: paidService("cancelled") });
  const res = await route.POST(fakeReq(REACTIVATE));
  assert.equal(res.status, 403);
});

test("la ruta responde 404 en español para un servicio que no existe", async () => {
  const { route } = routeModule({ service: null });
  const res = await route.POST(fakeReq(REACTIVATE));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Servicio no encontrado.");
});
