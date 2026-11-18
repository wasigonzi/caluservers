// Porkbun: adaptador de la API v3 (sin red real: transporte falso inyectado).
// Claves, dominios y respuestas son señuelos locales; api.porkbun.com no se toca.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

class DomainQueryError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DomainQueryError";
    this.status = status;
  }
}

class OutboundError extends Error {
  constructor(code) {
    super(`outbound:${code}`);
    this.name = "OutboundError";
    this.code = code;
  }
}

/**
 * Carga lib/porkbun.ts con el transporte falso `fake` y los mocks dados.
 * `fake` recibe { url, method, headers, body } y devuelve { status, json }.
 */
function loadPorkbun({ fake, plugin = {}, rdap = {}, tldRow = null } = {}) {
  const calls = [];
  const transport = async (options) => {
    const parsed = { ...options, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(parsed);
    if (typeof fake === "function") return fake(parsed, calls);
    throw new Error("transporte no configurado en la prueba");
  };
  const h = loader({
    "./plugins": {
      isPluginEnabled: async () => plugin.enabled ?? true,
      getPluginSecrets: async () =>
        plugin.secrets === undefined
          ? { apiKey: "pk1_test_api_key", secretKey: "sk1_test_secret_key" }
          : plugin.secrets,
      getPluginConfig: async () => plugin.config ?? { mode: "live" },
    },
    "./domain-lookup": {
      DomainQueryError,
      lookupDomain: async (domain) => {
        if (rdap.state) return { domain, tld: ".com", state: rdap.state, checkedAt: new Date().toISOString() };
        return { domain, tld: ".com", state: "available", checkedAt: new Date().toISOString() };
      },
    },
    "./outbound": {
      OutboundError,
      requestJson: async () => {
        throw new Error("red real no permitida en la prueba");
      },
    },
    "./db": {
      db: {
        tldPrice: {
          findUnique: async () => tldRow,
        },
      },
    },
  });
  const mod = h.load("lib/porkbun.ts");
  mod.__setPorkbunFetch(transport);
  return { mod, calls };
}

const SUCCESS = (json) => ({ status: 200, json: { status: "SUCCESS", ...json } });

test("sin plugin activo o sin secretos, registrar lanza unconfigured", async () => {
  const disabled = loadPorkbun({ plugin: { enabled: false } });
  await assert.rejects(
    () => disabled.mod.porkbunRegistrar.register({
      domain: "midominio.com",
      years: 1,
      registrant: { name: "Ana", email: "ana@example.com" },
    }),
    (error) => error.code === "unconfigured",
  );
  const noSecrets = loadPorkbun({ plugin: { secrets: null } });
  await assert.rejects(
    () => noSecrets.mod.porkbunRegistrar.register({
      domain: "midominio.com",
      years: 1,
      registrant: { name: "Ana", email: "ana@example.com" },
    }),
    (error) => error.code === "unconfigured",
  );
});

test("parseUsdToCents: texto USD a céntimos sin inventar nada", async () => {
  const { mod } = loadPorkbun();
  assert.equal(mod.parseUsdToCents("9.20"), 920);
  assert.equal(mod.parseUsdToCents("10"), 1000);
  assert.equal(mod.parseUsdToCents("0.99"), 99);
  assert.equal(mod.parseUsdToCents(9.99), 999);
  assert.equal(mod.parseUsdToCents("abc"), null);
  assert.equal(mod.parseUsdToCents(""), null);
  assert.equal(mod.parseUsdToCents(null), null);
});

test("getPricing: parsea registration/renewal/transfer y marca unsupported", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url }) => {
      assert.match(url, /\/pricing\/get$/);
      return SUCCESS({
        pricing: {
          com: { registration: "9.20", renewal: "10.50", transfer: "9.20" },
          net: { registration: "11.00", renewal: "12.00", transfer: "11.00" },
        },
        unsupported: ["xyz"],
      });
    },
  });
  // pricing/get es pública: funciona incluso sin plugin activo.
  const result = await mod.getPricing([".com", ".net", ".xyz"]);
  // Comparación por campo: los objetos vienen del contexto VM del cargador.
  assert.equal(result.prices[".com"].registerCents, 920);
  assert.equal(result.prices[".com"].renewCents, 1050);
  assert.equal(result.prices[".com"].transferCents, 920);
  assert.equal(result.prices[".net"].registerCents, 1100);
  assert.equal(result.prices[".net"].renewCents, 1200);
  assert.equal(result.prices[".net"].transferCents, 1100);
  assert.deepEqual([...result.unsupported], [".xyz"]);
  assert.equal(calls[0].headers["X-API-Key"], undefined);
  assert.deepEqual(calls[0].body.tlds, ["com", "net", "xyz"]);
});

test("checkAvailability: RDAP decide; precio de Porkbun cuando hay credenciales", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url }) => {
      if (url.includes("/domain/checkDomain/")) {
        return SUCCESS({ avail: "yes", price: "12.34", additional: { renewal: { price: "13.00" } } });
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const result = await mod.porkbunRegistrar.checkAvailability("midominio.com");
  assert.equal(result.available, true);
  assert.equal(result.priceCents, 1234);
  assert.equal(result.currency, "USD");
  assert.ok(calls.some((call) => call.url.includes("/domain/checkDomain/midominio.com")));
});

test("checkAvailability: RDAP registrado no llama a Porkbun y no da precio", async () => {
  const { mod, calls } = loadPorkbun({
    rdap: { state: "registered" },
    fake: () => {
      throw new Error("no debería llamar a Porkbun");
    },
  });
  const result = await mod.porkbunRegistrar.checkAvailability("ocupado.com");
  assert.equal(result.available, false);
  assert.equal(result.priceCents, undefined);
  assert.equal(calls.length, 0);
});

test("checkAvailability: RDAP sin confirmar nunca se presenta como libre", async () => {
  const { mod } = loadPorkbun({ rdap: { state: "unverified" } });
  await assert.rejects(
    () => mod.porkbunRegistrar.checkAvailability("dudoso.com"),
    (error) => error.code === "unverified",
  );
});

test("checkAvailability: sin credenciales el precio sale de TldPrice; sin precio, ausente", async () => {
  const withPrice = loadPorkbun({
    plugin: { secrets: null },
    tldRow: { tld: ".com", registerCents: 1500, active: true },
  });
  const priced = await withPrice.mod.porkbunRegistrar.checkAvailability("midominio.com");
  assert.equal(priced.available, true);
  assert.equal(priced.priceCents, 1500);

  const withoutPrice = loadPorkbun({ plugin: { secrets: null }, tldRow: null });
  const unpriced = await withoutPrice.mod.porkbunRegistrar.checkAvailability("midominio.com");
  assert.equal(unpriced.available, true);
  assert.equal(unpriced.priceCents, undefined);
});

test("register: re-cotiza, exige el coste exacto y confirma con getDomain", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url, method, headers, body }) => {
      if (url.includes("/domain/checkDomain/")) {
        return SUCCESS({ avail: "yes", price: "9.99", additional: { renewal: { price: "10.99" } } });
      }
      if (url.includes("/domain/create/")) {
        assert.equal(method, "POST");
        assert.equal(body.cost, 999);
        assert.equal(body.agreeToTerms, "yes");
        assert.match(headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
        assert.equal(headers["X-API-Key"], "pk1_test_api_key");
        assert.equal(headers["X-Secret-API-Key"], "sk1_test_secret_key");
        return SUCCESS({ domain: "midominio.com", cost: 999, orderId: "PB-123", balance: "90.01" });
      }
      if (url.includes("/domain/get/")) {
        // Forma anidada: el estado del dominio va en `domain`, no en el
        // `status` de la envoltura (que es SUCCESS).
        return SUCCESS({
          domain: { status: "ACTIVE", expiration: "2027-11-18T00:00:00Z", autoRenew: "no" },
        });
      }
      if (url.includes("/domain/getNs/")) {
        return SUCCESS({ ns: ["ns1.example.com", "ns2.example.com"] });
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const result = await mod.porkbunRegistrar.register({
    domain: "midominio.com",
    years: 1,
    registrant: { name: "Ana", email: "ana@example.com" },
  });
  assert.equal(result.domain, "midominio.com");
  assert.equal(result.orderId, "PB-123");
  assert.equal(result.expiresAt.toISOString().slice(0, 10), "2027-11-18");
  assert.equal(result.expiresAtEstimated, false);
});

test("register: dominio ocupado no llega a crear nada", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url }) => {
      if (url.includes("/domain/checkDomain/")) return SUCCESS({ avail: "no", price: "9.99" });
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await assert.rejects(
    () =>
      mod.porkbunRegistrar.register({
        domain: "ocupado.com",
        years: 1,
        registrant: { name: "Ana", email: "ana@example.com" },
      }),
    (error) => error.code === "unavailable",
  );
  assert.equal(calls.filter((call) => call.url.includes("/domain/create/")).length, 0);
});

test("register: si getDomain falla, el vencimiento se estima a +1 año y se marca", async () => {
  const { mod } = loadPorkbun({
    fake: ({ url }) => {
      if (url.includes("/domain/checkDomain/")) return SUCCESS({ avail: "yes", price: "9.99" });
      if (url.includes("/domain/create/")) return SUCCESS({ domain: "midominio.com", orderId: "PB-9" });
      if (url.includes("/domain/get/")) return { status: 500, json: { status: "ERROR", code: "UNKNOWN" } };
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const before = new Date();
  const result = await mod.porkbunRegistrar.register({
    domain: "midominio.com",
    years: 1,
    registrant: { name: "Ana", email: "ana@example.com" },
  });
  assert.equal(result.expiresAtEstimated, true);
  assert.equal(result.expiresAt.getFullYear(), before.getFullYear() + 1);
});

test("register: error ERROR de Porkbun se traduce a español sin el cuerpo crudo", async () => {
  const { mod } = loadPorkbun({
    fake: ({ url }) => {
      if (url.includes("/domain/checkDomain/")) return SUCCESS({ avail: "yes", price: "9.99" });
      if (url.includes("/domain/create/")) {
        return { status: 200, json: { status: "ERROR", code: "DOMAIN_TAKEN", message: "secreto interno que no debe salir" } };
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await assert.rejects(
    () =>
      mod.porkbunRegistrar.register({
        domain: "midominio.com",
        years: 1,
        registrant: { name: "Ana", email: "ana@example.com" },
      }),
    (error) => {
      assert.equal(error.code, "unavailable");
      assert.doesNotMatch(error.message, /secreto interno/);
      return true;
    },
  );
});

test("renew: usa priceType=renewal y el precio de renovación exacto", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url, body }) => {
      if (url.includes("/domain/checkDomain/")) {
        assert.equal(body.priceType, "renewal");
        return SUCCESS({
          avail: "yes",
          price: "10.99",
          additional: { renewal: { price: "10.99" } },
        });
      }
      if (url.includes("/domain/renew/")) {
        assert.equal(body.cost, 1099);
        return SUCCESS({ domain: "midominio.com", orderId: "PB-77" });
      }
      if (url.includes("/domain/get/")) {
        return SUCCESS({
          domain: { status: "ACTIVE", expiration: "2027-11-18T00:00:00Z" },
        });
      }
      if (url.includes("/domain/getNs/")) return SUCCESS({ ns: [] });
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const result = await mod.porkbunRegistrar.renew("midominio.com", 1);
  assert.equal(result.orderId, "PB-77");
  assert.equal(result.expiresAt.toISOString().slice(0, 10), "2027-11-18");
  assert.equal(calls.filter((call) => call.url.includes("/domain/renew/")).length, 1);
});

test("transfer: .uk no va por API y el camino feliz usa el coste exacto", async () => {
  const uk = loadPorkbun({});
  await assert.rejects(
    () => uk.mod.porkbunRegistrar.transfer({ domain: "midominio.uk", authCode: "ABC-123" }),
    (error) => error.code === "not-supported",
  );

  const { mod, calls } = loadPorkbun({
    fake: ({ url, body }) => {
      if (url.includes("/domain/checkDomain/")) {
        return SUCCESS({
          avail: "no",
          price: "9.99",
          additional: { transfer: { price: "8.50" } },
        });
      }
      if (url.includes("/domain/transfer/")) {
        assert.equal(body.authCode, "EPP-123");
        assert.equal(body.cost, 850);
        return SUCCESS({ domain: "midominio.com" });
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const result = await mod.porkbunRegistrar.transfer({
    domain: "midominio.com",
    authCode: "EPP-123",
  });
  assert.equal(result.status, "pending_transfer");
  assert.equal(calls.filter((call) => call.url.includes("/domain/transfer/")).length, 1);
});

test("getAuthCode no existe en Porkbun: error honesto not-supported", async () => {
  const { mod, calls } = loadPorkbun({});
  await assert.rejects(
    () => mod.porkbunRegistrar.getAuthCode("midominio.com"),
    (error) => error.code === "not-supported",
  );
  assert.equal(calls.length, 0);
});

test("setAutoRenew no toca Porkbun: no hay ninguna llamada", async () => {
  const { mod, calls } = loadPorkbun({});
  await mod.porkbunRegistrar.setAutoRenew("midominio.com", true);
  await mod.porkbunRegistrar.setAutoRenew("midominio.com", false);
  assert.equal(calls.length, 0);
});

test("setNameservers: actualiza el conjunto sin orden con el campo ns", async () => {
  const { mod, calls } = loadPorkbun({
    fake: ({ url, body }) => {
      if (url.includes("/domain/updateNs/")) {
        // Conjunto sin orden: se compara ordenado.
        assert.deepEqual([...body.ns].sort(), ["ns1.example.com", "ns2.example.com"]);
        return SUCCESS({ domain: "midominio.com" });
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await mod.porkbunRegistrar.setNameservers("midominio.com", [
    "ns2.example.com",
    "ns1.example.com",
    "ns1.example.com",
  ]);
  assert.equal(calls.length, 1);
  await assert.rejects(
    () => mod.porkbunRegistrar.setNameservers("midominio.com", []),
    (error) => error.code === "invalid",
  );
});

test("getRegistrar: solo porkbun; otra clave es not-supported", async () => {
  const { mod } = loadPorkbun({});
  assert.equal(mod.getRegistrar("porkbun").key, "porkbun");
  assert.equal(mod.getRegistrar().key, "porkbun");
  assert.throws(
    () => mod.getRegistrar("godaddy"),
    (error) => error.code === "not-supported",
  );
});
