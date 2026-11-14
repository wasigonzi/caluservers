// Acciones de gestión de servicios en el panel: reactivar un servicio
// cancelado, cancelar uno activo y rechazos de la ruta (sin admin, sin
// origen de confianza, servicio inexistente).
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

function fakeDb(service) {
  const store = service ? { ...service } : null;
  const state = { events: [], updates: [] };
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

function routeModule({ admin = true, trusted = true, service } = {}) {
  const { db, state } = fakeDb(service);
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

test("la ruta cancela un servicio activo", async () => {
  const { route, state } = routeModule({ service: paidService("active") });
  const res = await route.POST(
    fakeReq({ action: "service-status", serviceId: "svc-1", status: "cancelled", note: "baja pedida por el cliente" }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "cancelled");
  assert.equal(state.events[0].details, "active->cancelled");
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
