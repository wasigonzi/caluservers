// Rutas de dominios (Fase 3): cron con autorización, propiedad por
// recurso en la cuenta, permisos de admin y precio publicado en la
// consulta pública. Todos los dominios, claves y secretos son señuelos.
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

class AuthorizationError extends Error {
  constructor(permission) {
    super("FORBIDDEN");
    this.name = "AuthorizationError";
    this.status = 403;
    this.permission = permission;
  }
}

class FakeResponse {
  constructor(body, status, location) {
    this.body = body;
    this.status = status;
    this.location = location;
  }
  async json() {
    return this.body;
  }
}

const nextServer = {
  NextResponse: class {
    static json(data, init) {
      return new FakeResponse(data, init?.status ?? 200);
    }
    static redirect(url) {
      return new FakeResponse(null, 303, String(url));
    }
  },
  NextRequest: class {},
};

const DOMAIN_A = {
  id: "dom_A",
  userId: "user_A",
  domain: "midominio.com",
  registrarKey: "porkbun",
  status: "active",
  autoRenew: true,
  expiresAt: new Date("2027-01-15T00:00:00.000Z"),
  nameservers: ["ns1.ejemplo.test", "ns2.ejemplo.test"],
  createdAt: new Date("2026-01-15T00:00:00.000Z"),
  updatedAt: new Date("2026-01-15T00:00:00.000Z"),
  failureReason: null,
  orderId: "ord_A",
  // Nunca debe salir en una respuesta.
  authCodeEncrypted: "secreto-cifrado-senuelo",
};

function jsonHeaders(body) {
  return {
    get: (name) => {
      const lower = name.toLowerCase();
      if (lower === "content-type") return "application/json";
      if (lower === "origin") return "https://cuenta.test";
      if (lower === "host") return "cuenta.test";
      return null;
    },
  };
}

function jsonReq(body, url = "https://cuenta.test/api/test") {
  return { headers: jsonHeaders(body), json: async () => body, url };
}

/* ------------------------------ cron ------------------------------ */

function cronBuild(mocks = {}) {
  const state = { syncs: 0, reminders: 0, renewed: [], finished: null };
  const secret = mocks.secret ?? "secreto-largo";
  const h = loader({
    "next/server": nextServer,
    "@/lib/db": { db: { registeredDomain: { findMany: async () => mocks.dueDomains ?? [] } } },
    "@/lib/commerce": { CommerceError },
    "@/lib/billing-cron": {
      authorizeCronRequest: (reqHeaders) => {
        if (!secret) throw new CommerceError("El cron no está configurado: falta CRON_SECRET.", 503);
        const header = reqHeaders.get("authorization") ?? "";
        if (header !== `Bearer ${secret}`) throw new CommerceError("No autorizado.", 401);
      },
      claimBillingRun: async (kind, runDay) => {
        if (mocks.alreadyRan) {
          return {
            run: { id: "run_1", processed: 3, succeeded: 3, failed: 0 },
            alreadyRan: true,
          };
        }
        return { run: { id: "run_1", processed: 0, succeeded: 0, failed: 0 }, alreadyRan: false };
      },
      finishBillingRun: async (runId, stats) => {
        state.finished = { runId, stats };
        return { id: runId };
      },
      runDayOf: () => "2026-11-18",
    },
    "@/lib/domains": {
      syncTldPrices: async () => {
        state.syncs += 1;
        return mocks.prices ?? { updated: 6, failed: 0, skipped: false };
      },
      runDomainRenewalReminders: async () => {
        state.reminders += 1;
        return mocks.reminderStats ?? { processed: 2, succeeded: 2, failed: 0 };
      },
      tryAutoRenewWithCredit: async (domain) => {
        state.renewed.push(domain.domain);
        if (mocks.renewFailsFor?.includes(domain.domain)) return { renewed: false, reason: "sin-credito" };
        return { renewed: true, order: {}, invoice: {}, afterPayment: { acted: true } };
      },
    },
  });
  return { route: h.load("app/api/cron/domains/route.ts"), state };
}

test("cron sin CRON_SECRET responde 503 honesto", async () => {
  const { route } = cronBuild({ secret: "" });
  const res = await route.GET({ headers: headers({}) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
});

test("cron con secreto incorrecto responde 401", async () => {
  const { route } = cronBuild({});
  for (const value of [undefined, "Bearer incorrecto"]) {
    const map = value ? { authorization: value } : {};
    const res = await route.GET({ headers: headers(map) });
    assert.equal(res.status, 401, value ?? "(sin cabecera)");
  }
});

test("cron con secreto correcto corre precios, recordatorios y auto-renovación", async () => {
  const due = [
    { ...DOMAIN_A, domain: "pronto.test", expiresAt: new Date("2026-11-20T00:00:00.000Z") },
    { ...DOMAIN_A, id: "dom_B", domain: "sinc.redito.test", expiresAt: new Date("2026-11-19T00:00:00.000Z") },
  ];
  const { route, state } = cronBuild({
    dueDomains: due,
    renewFailsFor: ["sinc.redito.test"],
  });
  const res = await route.GET({ headers: headers({ authorization: "Bearer secreto-largo" }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.alreadyRan, false);
  assert.equal(body.kind, "domains");
  assert.equal(state.syncs, 1);
  assert.equal(state.reminders, 1);
  // Un dominio sin crédito no se renueva, pero no es un fallo ni tumba
  // la corrida: el otro se renueva y el motivo queda anotado.
  assert.deepEqual(state.renewed, ["pronto.test", "sinc.redito.test"]);
  assert.equal(body.stats.autoRenew.succeeded, 1);
  assert.equal(body.stats.autoRenew.failed, 0);
  assert.ok(body.stats.autoRenew.details.some((line) => /sin-credito/.test(line)));
  assert.equal(body.stats.prices.updated, 6);
  assert.ok(state.finished);
});

test("cron que ya corrió hoy no re-ejecuta", async () => {
  const { route, state } = cronBuild({ alreadyRan: true });
  const res = await route.GET({ headers: headers({ authorization: "Bearer secreto-largo" }) });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.alreadyRan, true);
  assert.equal(state.syncs, 0);
  assert.equal(state.reminders, 0);
});

/* ------------------------------ cuenta: propiedad ------------------------------ */

function accountBuild(mocks = {}) {
  const state = { orders: [] };
  const domains = mocks.domains ?? [DOMAIN_A];
  const db = {
    registeredDomain: {
      findMany: async ({ where }) => domains.filter((d) => d.userId === where.userId),
      findFirst: async ({ where }) =>
        domains.find((d) => d.id === where.id && d.userId === where.userId) ?? null,
      findUnique: async ({ where }) => domains.find((d) => d.domain === where.domain) ?? null,
      update: async ({ where, data }) => {
        const found = domains.find((d) => d.id === where.id);
        return { ...found, ...data };
      },
    },
  };
  const h = loader({
    "next/server": nextServer,
    "@/lib/commerce": { CommerceError },
    "@/lib/customer-session": {
      customerSession: async () => mocks.session ?? { user: { id: "user_A", email: "a@test.local", name: "A" } },
    },
    "@/lib/db": { db },
    "@/lib/domains": {
      createDomainOrder: async (input) => {
        if (mocks.orderError) throw mocks.orderError;
        state.orders.push(input);
        // Forma real: {...pedido, invoice} (no {order, invoice}).
        return {
          id: "ord_1",
          trackingToken: "tok",
          totalCents: 1299,
          currency: "USD",
          status: "submitted",
          invoice: { id: "inv_1", number: "PF-0001", totalCents: 1299, currency: "USD", status: "issued" },
        };
      },
      getRegistrar: () => mocks.registrar ?? {
        setAutoRenew: async () => {},
        setNameservers: async () => {},
        getDomain: async (domain) => ({ domain, status: "active", expiresAt: new Date("2027-01-15T00:00:00.000Z"), nameservers: ["ns1.ejemplo.test"] }),
      },
    },
  });
  return { h, state };
}

test("cliente A pide el dominio de B y recibe 404, sin filtrar nada", async () => {
  const { h } = accountBuild();
  const route = h.load("app/api/account/domains/[id]/route.ts");
  const res = await route.GET({}, { params: Promise.resolve({ id: "dom_B" }) });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test("el detalle propio no devuelve el código cifrado ni secretos", async () => {
  const { h } = accountBuild();
  const route = h.load("app/api/account/domains/[id]/route.ts");
  const res = await route.GET({}, { params: Promise.resolve({ id: "dom_A" }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.domain.domain, "midominio.com");
  assert.equal("authCodeEncrypted" in body.domain, false);
  assert.equal(JSON.stringify(body).includes("secreto-cifrado"), false);
});

test("pedir el código EPP responde 501 honesto", async () => {
  const { h } = accountBuild();
  const route = h.load("app/api/account/domains/[id]/route.ts");
  const res = await route.POST(jsonReq({ action: "authcode" }), {
    params: Promise.resolve({ id: "dom_A" }),
  });
  assert.equal(res.status, 501);
  assert.match((await res.json()).error, /Porkbun/);
});

test("servidores de nombres no válidos responden 400", async () => {
  const { h } = accountBuild();
  const route = h.load("app/api/account/domains/[id]/route.ts");
  const res = await route.POST(jsonReq({ action: "nameservers", nameservers: ["no es un host"] }), {
    params: Promise.resolve({ id: "dom_A" }),
  });
  assert.equal(res.status, 400);
});

test("crear un pedido sin precio publicado responde 400 honesto (registro asistido), sin inventar precio", async () => {
  const { h, state } = accountBuild({
    orderError: new CommerceError("registro asistido: ese TLD no se registra automáticamente, contacta con soporte (.pr).", 400),
  });
  const route = h.load("app/api/account/domains/route.ts");
  const res = await route.POST(
    jsonReq({ domain: "midominio.pr", kind: "register" }),
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /asistido/);
  assert.equal(state.orders.length, 0);
});

test("crear un pedido válido devuelve pedido y factura", async () => {
  const { h, state } = accountBuild();
  const route = h.load("app/api/account/domains/route.ts");
  const res = await route.POST(
    jsonReq({ domain: "MIDOMINIO.com", kind: "register", idempotencyKey: "clave-1" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.invoice.number, "PF-0001");
  assert.equal(state.orders[0].domain, "midominio.com");
  assert.equal(state.orders[0].kind, "register");
});

/* ------------------------------ admin: permisos ------------------------------ */

function adminBuild(mocks = {}) {
  const db = {
    registeredDomain: {
      count: async () => 1,
      groupBy: async () => [{ status: "active", _count: 1 }],
      findMany: async () => [DOMAIN_A],
      findUnique: async ({ where }) => (where.id === "dom_A" ? DOMAIN_A : null),
      update: async ({ where, data }) => ({ ...DOMAIN_A, ...data }),
    },
    user: {
      findMany: async () => [{ id: "user_A", email: "a@test.local", name: "A" }],
    },
  };
  const h = loader({
    "next/server": nextServer,
    "@/lib/commerce": { CommerceError },
    "@/lib/db": { db },
    "@/lib/auth": {
      AuthorizationError,
      requirePermission: async () => {
        if (mocks.denied) throw new AuthorizationError("domains:view");
        return { email: "admin@test.local", permissions: ["domains:view", "domains:write"] };
      },
      getAdminSession: async () => ({ email: "admin@test.local", permissions: ["domains:view"] }),
    },
    "@/lib/domains": {
      retryDomainRegistration: async () => ({ ok: true }),
      createDomainOrder: async () => ({
        id: "ord_1",
        totalCents: 1299,
        currency: "USD",
        status: "submitted",
        invoice: { id: "inv_1", number: "PF-0001", totalCents: 1299, currency: "USD", status: "issued" },
      }),
      getRegistrar: () => ({
        getDomain: async (domain) => ({ domain, status: "active", expiresAt: new Date("2027-01-15T00:00:00.000Z") }),
      }),
    },
  });
  return { h };
}

test("admin sin permiso domains:view recibe 403", async () => {
  const { h } = adminBuild({ denied: true });
  const route = h.load("app/api/admin/domains/route.ts");
  const res = await route.GET({
    nextUrl: { searchParams: new URLSearchParams("") },
    headers: { get: () => null },
  });
  assert.equal(res.status, 403);
});

test("admin con permiso lista los dominios", async () => {
  const { h } = adminBuild();
  const route = h.load("app/api/admin/domains/route.ts");
  const res = await route.GET({
    nextUrl: { searchParams: new URLSearchParams("") },
    headers: { get: () => null },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.equal(body.domains[0].domain, "midominio.com");
});

/* ------------------------------ /api/domains: precio ------------------------------ */

function publicBuild(mocks = {}) {
  const h = loader({
    "next/server": nextServer,
    "@/lib/domain-lookup": {
      DomainQueryError: class extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
      lookupDomain: async () => ({
        domain: "libre-auditoria.com",
        tld: ".com",
        state: "available",
        checkedAt: "2026-11-18T00:00:00.000Z",
      }),
      supportedTlds: () => [".com", ".net"],
    },
    "@/lib/login-rate-limit": { clientRateKey: () => "test-key" },
    "@/lib/request-throttle": { consumeRequest: async () => ({ allowed: true, retryAfterSec: 0 }) },
    "@/lib/domains": {
      getTldPrice: async () => mocks.price ?? null,
    },
  });
  return h.load("app/api/domains/route.ts");
}

function publicReq() {
  return {
    nextUrl: { searchParams: new URLSearchParams("name=libre-auditoria.com") },
    headers: { get: () => null },
  };
}

test("/api/domains devuelve el precio publicado junto a la disponibilidad", async () => {
  const route = publicBuild({
    price: { tld: ".com", registerCents: 1299, renewCents: 1499, transferCents: 1299, currency: "USD", active: true },
  });
  const res = await route.GET(publicReq());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "available");
  assert.equal(body.priceCents, 1299);
  assert.equal(body.registerCents, 1299);
  assert.equal(body.renewCents, 1499);
  assert.equal(body.transferCents, 1299);
  assert.equal(body.currency, "USD");
});

test("/api/domains sin precio publicado devuelve null, sin inventar cifra", async () => {
  const route = publicBuild({ price: null });
  const res = await route.GET(publicReq());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "available");
  assert.equal(body.priceCents, null);
  assert.equal(body.currency, null);
});
