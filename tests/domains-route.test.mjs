// GET /api/domains nunca devuelve 403 (arreglo 8, auditoría 2026-11-15).
// Un crawler de texto vio un 403 en vivo, pero ningún código de esta ruta lo
// emite: 400 sin nombre o dominio no válido, 429 si se agota el límite, 503
// si la base del límite o el RDAP no responden. Sin middleware ni guarda de
// origen en el repo. La lógica RDAP no se toca: se simula lookupDomain.
// Todos los dominios y hosts de las pruebas son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loader, root } from "./helpers/load.mjs";
import { resolve } from "node:path";

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status;
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
  },
  NextRequest: class {},
};

class DomainQueryError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function build({ consume, lookup }) {
  const h = loader({
    "next/server": nextServer,
    "@/lib/domain-lookup": {
      DomainQueryError,
      lookupDomain: lookup,
      supportedTlds: () => [".com", ".net"],
    },
    "@/lib/login-rate-limit": { clientRateKey: () => "test-key" },
    "@/lib/request-throttle": { consumeRequest: consume },
  });
  return h.load("app/api/domains/route.ts");
}

function fakeReq(query) {
  return {
    nextUrl: { searchParams: new URLSearchParams(query) },
    headers: { get: () => null },
  };
}

const allowed = async () => ({ allowed: true, retryAfterSec: 0 });

test("sin nombre devuelve 400, no 403", async () => {
  const route = build({ consume: allowed, lookup: async () => { throw new Error("no debía consultar"); } });
  const res = await route.GET(fakeReq(""));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test("una consulta permitida devuelve 200 con el estado RDAP", async () => {
  let seen;
  const route = build({
    consume: allowed,
    lookup: async (name) => {
      seen = name;
      return { domain: "libre-auditoria.com", tld: ".com", state: "available", checkedAt: "2026-11-15T00:00:00.000Z" };
    },
  });
  const res = await route.GET(fakeReq("name=libre-auditoria.com"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.state, "available");
  assert.equal(seen, "libre-auditoria.com");
});

test("límite agotado devuelve 429, no 403", async () => {
  const route = build({
    consume: async () => ({ allowed: false, retryAfterSec: 60 }),
    lookup: async () => { throw new Error("no debía consultar"); },
  });
  const res = await route.GET(fakeReq("name=libre-auditoria.com"));
  assert.equal(res.status, 429);
});

test("sin contador compartido (base caída) devuelve 503, no 403", async () => {
  const route = build({
    consume: async () => { throw new Error("base caída"); },
    lookup: async () => { throw new Error("no debía consultar"); },
  });
  const res = await route.GET(fakeReq("name=libre-auditoria.com"));
  assert.equal(res.status, 503);
});

test("un dominio no válido devuelve 400, no 403", async () => {
  const route = build({
    consume: allowed,
    lookup: async () => { throw new DomainQueryError("Dominio no válido.", 400); },
  });
  const res = await route.GET(fakeReq("name=malo"));
  assert.equal(res.status, 400);
});

test("la ruta no emite ningún 403 en su código (sin contar el comentario que lo documenta)", () => {
  const route = readFileSync(resolve(root, "app/api/domains/route.ts"), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /403/);
  assert.match(route, /crawler de texto en vivo/);
});
