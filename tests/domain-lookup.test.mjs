// Consulta RDAP de disponibilidad. Dominios y servidores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const BOOTSTRAP = {
  services: [
    [["com", "net"], ["https://rdap.verisign.example/v1/"]],
    [["org"], ["https://rdap.org-registry.example/rdap/"]],
    [["store"], ["http://inseguro.example/rdap/"]],
  ],
};

/** Respuestas encadenadas para cada llamada de salida. */
function build(responses, { env } = {}) {
  const calls = [];
  const queue = [...responses];
  const h = loader({
    "./outbound": {
      OutboundError: class OutboundError extends Error {
        constructor(code) {
          super(`outbound:${code}`);
          this.code = code;
        }
      },
      requestJson: async (options) => {
        calls.push(options);
        const next = queue.shift();
        if (!next) throw new Error("llamada de salida inesperada");
        if (next.throw) {
          const error = new Error("outbound");
          error.code = next.throw;
          throw error;
        }
        return next;
      },
    },
    env,
  });
  const module = h.load("lib/domain-lookup.ts");
  module.resetBootstrapCache();
  return { module, calls };
}

test("normaliza el nombre y aplica la extensión elegida", () => {
  const { module } = build([]);
  // Los objetos vienen de otro realm: se comparan campo a campo.
  const same = (actual, expected) => {
    assert.equal(actual.domain, expected.domain);
    assert.equal(actual.tld, expected.tld);
  };
  same(module.normalizeDomain("MiDominio.COM"), { domain: "midominio.com", tld: ".com" });
  same(module.normalizeDomain("midominio", ".net"), { domain: "midominio.net", tld: ".net" });
  same(module.normalizeDomain("https://www.midominio.org/"), {
    domain: "midominio.org",
    tld: ".org",
  });
  // IDN a punycode.
  assert.equal(module.normalizeDomain("mañana.com").domain, "xn--maana-pta.com");
});

test("rechaza subdominios, extensiones ajenas y basura", () => {
  const { module } = build([]);
  for (const input of [
    "a.b.midominio.com",
    "midominio.xyz",
    "midominio",
    "mi dominio.com",
    "midominio.com/ruta",
    "-malo.com",
    "",
    "a".repeat(70) + ".com",
  ]) {
    assert.throws(
      () => module.normalizeDomain(input),
      (error) => error.name === "DomainQueryError" && error.status === 400,
      `debía rechazar: ${input}`,
    );
  }
});

test("404 del registro es libre y 200 es registrado", async () => {
  const libre = build([{ status: 200, json: BOOTSTRAP }, { status: 404, json: null }]);
  const available = await libre.module.lookupDomain("midominio.com");
  assert.equal(available.state, "available");
  assert.equal(available.domain, "midominio.com");

  const ocupado = build([{ status: 200, json: BOOTSTRAP }, { status: 200, json: { ldhName: "x" } }]);
  assert.equal((await ocupado.module.lookupDomain("midominio.com")).state, "registered");
});

test("la consulta va al servidor del arranque de IANA y solo a ese host", async () => {
  const { module, calls } = build([
    { status: 200, json: BOOTSTRAP },
    { status: 404, json: null },
  ]);
  await module.lookupDomain("midominio.com");
  assert.equal(calls[0].url, "https://data.iana.org/rdap/dns.json");
  assert.equal(calls[0].allowHosts.join(","), "data.iana.org");
  assert.equal(calls[1].url, "https://rdap.verisign.example/v1/domain/midominio.com");
  assert.equal(calls[1].allowHosts.join(","), "rdap.verisign.example");
});

test("un fallo nunca se presenta como dominio libre", async () => {
  for (const [responses, reason] of [
    [[{ throw: "timeout" }], "no-bootstrap"],
    [[{ status: 500, json: null }], "no-bootstrap"],
    [[{ status: 200, json: { services: [] } }], "no-bootstrap"],
    [[{ status: 200, json: BOOTSTRAP }, { throw: "network" }], "unreachable"],
    [[{ status: 200, json: BOOTSTRAP }, { status: 429, json: null }], "rate-limited"],
    [[{ status: 200, json: BOOTSTRAP }, { status: 503, json: null }], "bad-response"],
  ]) {
    const { module } = build(responses);
    const result = await module.lookupDomain("midominio.com");
    assert.equal(result.state, "unverified");
    assert.equal(result.reason, reason);
  }
});

test("una extensión sin servidor https en el arranque queda sin confirmar", async () => {
  const { module, calls } = build([{ status: 200, json: BOOTSTRAP }]);
  const result = await module.lookupDomain("midominio.store");
  assert.equal(result.state, "unverified");
  assert.equal(result.reason, "no-server");
  // No se intentó salir al servidor http del arranque.
  assert.equal(calls.length, 1);
});

test("el arranque se guarda en memoria y no se vuelve a pedir", async () => {
  const { module, calls } = build([
    { status: 200, json: BOOTSTRAP },
    { status: 404, json: null },
    { status: 404, json: null },
  ]);
  await module.lookupDomain("uno.com");
  await module.lookupDomain("dos.com");
  assert.equal(calls.filter((call) => call.url.includes("data.iana.org")).length, 1);
});

test("stateFromStatus mapea los códigos esperados", () => {
  const { module } = build([]);
  assert.equal(module.stateFromStatus(404), "available");
  assert.equal(module.stateFromStatus(200), "registered");
  assert.equal(module.stateFromStatus(429), "rate-limited");
  assert.equal(module.stateFromStatus(500), "bad-response");
  assert.equal(module.stateFromStatus(0), "bad-response");
});
