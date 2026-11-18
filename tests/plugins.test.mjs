// Registro de plugins (Fase 2, frente A): manifiestos, cifrado de secretos
// y API de admin. El cifrado es REAL (lib/secret-box.ts con la clave de
// prueba del cargador); la base es un señuelo en memoria. Todos los
// valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const SEED_ROWS = [
  {
    key: "stripe",
    kind: "payment",
    label: "Stripe",
    enabled: false,
    configJson: null,
    secretRef: null,
    lastRotatedAt: null,
  },
  {
    key: "paypal",
    kind: "payment",
    label: "PayPal",
    enabled: true,
    configJson: { mode: "sandbox" },
    secretRef: null,
    lastRotatedAt: null,
  },
  {
    key: "bank_transfer",
    kind: "payment",
    label: "Transferencia bancaria",
    enabled: true,
    configJson: null,
    secretRef: null,
    lastRotatedAt: null,
  },
  {
    key: "whm",
    kind: "panel",
    label: "WHM / cPanel",
    enabled: false,
    configJson: null,
    secretRef: null,
    lastRotatedAt: null,
  },
  // Fila sin manifiesto conocido: también se lista, con manifest null.
  {
    key: "misterioso",
    kind: "payment",
    label: "Misterioso",
    enabled: true,
    configJson: null,
    secretRef: null,
    lastRotatedAt: null,
  },
];

function makeDb(rows = SEED_ROWS) {
  const store = new Map(rows.map((row) => [row.key, { ...row }]));
  const audit = [];
  const db = {
    plugin: {
      findMany: async () => [...store.values()].map((row) => ({ ...row })),
      findUnique: async ({ where, select }) => {
        const row = store.get(where.key);
        if (!row) return null;
        if (!select) return { ...row };
        const out = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = row[key];
        }
        return out;
      },
      update: async ({ where, data }) => {
        const row = store.get(where.key);
        if (!row) throw new Error("Plugin no encontrado (señuelo).");
        Object.assign(row, data);
        return { ...row };
      },
    },
    adminAudit: {
      create: async ({ data }) => {
        audit.push(data);
        return data;
      },
    },
  };
  return { db, store, audit };
}

function pluginsSetup(rows) {
  const { db, store, audit } = makeDb(rows);
  const h = loader({ "@/lib/db": { db } });
  const plugins = h.load("lib/plugins.ts");
  return { plugins, store, audit };
}

/**
 * Igualdad estructural por JSON: los objetos que salen del módulo cargado
 * viven en otro reino del VM y `deepStrictEqual` los rechaza por prototipo.
 */
function same(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

/* ------------------------------ manifiestos ------------------------------ */

test("manifiestos: uno por plugin conocido, con kind, esquema y capacidades válidos", () => {
  const { plugins } = pluginsSetup();
  const kinds = new Set(["payment", "registrar", "panel"]);
  const fieldTypes = new Set(["text", "password", "select", "number", "textarea", "checkbox"]);
  const keys = new Set();
  assert.ok(plugins.PLUGIN_MANIFESTS.length >= 4);
  for (const manifest of plugins.PLUGIN_MANIFESTS) {
    assert.ok(manifest.key && !keys.has(manifest.key), `clave duplicada: ${manifest.key}`);
    keys.add(manifest.key);
    assert.ok(kinds.has(manifest.kind), `${manifest.key}: kind no válido`);
    assert.ok(manifest.label);
    assert.ok(Array.isArray(manifest.configSchema));
    assert.ok(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0);
    assert.ok(manifest.transport);
    const fieldNames = new Set();
    for (const field of manifest.configSchema) {
      assert.ok(!fieldNames.has(field.name), `${manifest.key}: campo duplicado ${field.name}`);
      fieldNames.add(field.name);
      assert.ok(fieldTypes.has(field.type), `${manifest.key}/${field.name}: tipo no válido`);
      assert.equal(typeof field.required, "boolean");
      if (field.type === "select") {
        assert.ok((field.options ?? []).length > 0, `${manifest.key}/${field.name}: select sin opciones`);
      }
    }
    const secretNames = new Set();
    for (const field of manifest.secretFields) {
      assert.ok(!secretNames.has(field.name), `${manifest.key}: secreto duplicado ${field.name}`);
      secretNames.add(field.name);
    }
  }
  // Los cuatro sembrados por la migración tienen manifiesto.
  for (const key of ["stripe", "paypal", "bank_transfer", "whm"]) {
    assert.ok(keys.has(key), `falta el manifiesto de ${key}`);
    assert.ok(plugins.getManifest(key), `getManifest(${key})`);
  }
  assert.equal(plugins.getManifest("inexistente"), null);
});

test("listPlugins: lista todos, con manifiesto null para el desconocido y hasSecrets solo como booleano", async () => {
  const { plugins } = pluginsSetup();
  const list = await plugins.listPlugins();
  assert.equal(list.length, SEED_ROWS.length);
  for (const plugin of list) {
    assert.equal(plugin.secretRef, undefined, "la vista pública no expone secretRef");
    assert.equal(typeof plugin.hasSecrets, "boolean");
  }
  const unknown = list.find((plugin) => plugin.key === "misterioso");
  assert.equal(unknown.manifest, null);
  assert.equal(unknown.hasSecrets, false);
  const stripe = list.find((plugin) => plugin.key === "stripe");
  assert.equal(stripe.manifest.key, "stripe");
  assert.equal(stripe.enabled, false);
});

/* ------------------------------ enabled ------------------------------ */

test("isPluginEnabled: false si está desactivado o no existe", async () => {
  const { plugins } = pluginsSetup();
  assert.equal(await plugins.isPluginEnabled("stripe"), false);
  assert.equal(await plugins.isPluginEnabled("paypal"), true);
  assert.equal(await plugins.isPluginEnabled("inexistente"), false);
});

test("setPluginEnabled: activa, desactiva y audita sin borrar config ni secretos", async () => {
  const { plugins, store, audit } = pluginsSetup();
  await plugins.setPluginEnabled("stripe", true, "admin@example.com");
  assert.equal(store.get("stripe").enabled, true);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "plugin.toggled");
  assert.match(audit[0].details, /stripe/);
  assert.doesNotMatch(audit[0].details, /sk_/);
  await plugins.setPluginEnabled("stripe", false, "admin@example.com");
  assert.equal(store.get("stripe").enabled, false);
  assert.equal(audit.length, 2);
  await assert.rejects(() => plugins.setPluginEnabled("inexistente", true), (error) => {
    assert.equal(error.code, "not-found");
    return true;
  });
});

/* ------------------------------ secretos ------------------------------ */

test("secretos: se guardan cifrados y se recuperan con openSecret", async () => {
  const { plugins, store, audit } = pluginsSetup();
  const secrets = { secretKey: "sk_test_secreto_local", webhookSecret: "whsec_local" };
  await plugins.setPluginSecrets("stripe", secrets, "admin@example.com");
  const stored = store.get("stripe").secretRef;
  assert.ok(typeof stored === "string" && stored.length > 0);
  assert.doesNotMatch(stored, /sk_test_secreto_local/);
  assert.doesNotMatch(stored, /whsec_local/);
  // La fecha se crea dentro del reino del VM: se comprueba por marca, no por instanceof.
  assert.equal(Object.prototype.toString.call(store.get("stripe").lastRotatedAt), "[object Date]");
  assert.equal(audit[0].action, "plugin.secrets_saved");
  assert.doesNotMatch(audit[0].details, /sk_test/);
  const recovered = await plugins.getPluginSecrets("stripe");
  same(recovered, secrets);
});

test("secretos: un campo vacío conserva el valor anterior; un campo desconocido se rechaza", async () => {
  const { plugins } = pluginsSetup();
  await plugins.setPluginSecrets("stripe", { secretKey: "sk_test_primero" });
  await plugins.setPluginSecrets("stripe", { secretKey: "", webhookSecret: "whsec_segundo" });
  const recovered = await plugins.getPluginSecrets("stripe");
  assert.equal(recovered.secretKey, "sk_test_primero");
  assert.equal(recovered.webhookSecret, "whsec_segundo");
  await assert.rejects(() => plugins.setPluginSecrets("stripe", { inventado: "x" }), (error) => {
    assert.equal(error.code, "invalid-secrets");
    return true;
  });
  // Sin secretos previos y todo vacío: no hay nada que guardar.
  const fresh = pluginsSetup();
  await assert.rejects(() => fresh.plugins.setPluginSecrets("stripe", { secretKey: "" }), (error) => {
    assert.equal(error.code, "invalid-secrets");
    return true;
  });
  // Con secretos previos y todo vacío: conserva sin error (no-op).
  const kept = await plugins.getPluginSecrets("stripe");
  assert.equal(kept.secretKey, "sk_test_primero");
});

test("secretos: sin guardar devuelve null; corrupto lanza error genérico sin filtrar el valor", async () => {
  const { plugins, store } = pluginsSetup();
  assert.equal(await plugins.getPluginSecrets("paypal"), null);
  store.get("stripe").secretRef = "v1:basura:corrupta:deadbeef";
  await assert.rejects(() => plugins.getPluginSecrets("stripe"), (error) => {
    assert.equal(error.code, "secret-unreadable");
    assert.doesNotMatch(error.message, /deadbeef|basura/);
    return true;
  });
});

/* ------------------------------ config ------------------------------ */

test("validatePluginConfig: obligatorios, select fuera de lista y campos desconocidos descartados", () => {
  const { plugins } = pluginsSetup();
  const stripe = plugins.getManifest("stripe");
  const missing = plugins.validatePluginConfig(stripe, {});
  assert.ok(missing.errors.some((error) => /Modo/.test(error)));
  const badSelect = plugins.validatePluginConfig(stripe, { mode: "nonsense" });
  assert.equal(badSelect.errors.length, 1);
  const ok = plugins.validatePluginConfig(stripe, {
    mode: "live",
    publishableKey: "pk_live_x",
    inventado: "se descarta",
  });
  assert.equal(ok.errors.length, 0);
  same(ok.config, { mode: "live", publishableKey: "pk_live_x" });
});

test("updatePluginConfig: guarda lo validado y audita; lo inválido no toca la base", async () => {
  const { plugins, store, audit } = pluginsSetup();
  const config = await plugins.updatePluginConfig("stripe", { mode: "sandbox" }, "admin@example.com");
  same(config, { mode: "sandbox" });
  same(store.get("stripe").configJson, { mode: "sandbox" });
  assert.equal(audit[0].action, "plugin.config_saved");
  await assert.rejects(() => plugins.updatePluginConfig("stripe", { mode: "mal" }), (error) => {
    assert.equal(error.code, "invalid-config");
    return true;
  });
  same(store.get("stripe").configJson, { mode: "sandbox" });
  await assert.rejects(() => plugins.updatePluginConfig("inexistente", {}), (error) => {
    assert.equal(error.code, "unknown-plugin");
    return true;
  });
});

/* ------------------------------ ruta API ------------------------------ */

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

/** Carga la ruta con auth y librería de plugins mockeadas. */
function routeSetup({ permissions = ["settings:write"], session = true } = {}) {
  const calls = { toggled: [], configSaved: [], secretsSaved: [] };
  class AuthorizationError extends Error {
    constructor(permission) {
      super("FORBIDDEN");
      this.status = 403;
      this.permission = permission;
    }
  }
  class PluginError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  const h = loader({
    "@/lib/auth": {
      AuthorizationError,
      requirePermission: async (permission) => {
        if (!session) throw new Error("UNAUTHORIZED");
        if (!permissions.includes(permission)) throw new AuthorizationError(permission);
        return { userId: "admin_1", email: "admin@example.com", roles: ["owner"], permissions, stepUpAt: null };
      },
    },
    "@/lib/plugins": {
      PluginError,
      listPlugins: async () => [
        {
          key: "stripe",
          kind: "payment",
          label: "Stripe",
          enabled: false,
          config: { mode: "sandbox" },
          hasSecrets: true,
          lastRotatedAt: null,
          manifest: { key: "stripe", kind: "payment", label: "Stripe" },
          // Señuelo con pinta de secreto: la ruta no debe devolverlo jamás.
          secretRef: "v1:aa:bb:cc",
          secretValue: "sk_test_NUNCA_DEBE_SALIR",
        },
      ],
      getPlugin: async (key) => ({
        key,
        kind: "payment",
        label: "Stripe",
        enabled: true,
        config: {},
        hasSecrets: true,
        lastRotatedAt: null,
        manifest: null,
      }),
      setPluginEnabled: async (key, enabled) => {
        calls.toggled.push({ key, enabled });
      },
      setPluginSecrets: async (key, secrets) => {
        calls.secretsSaved.push({ key, secrets });
      },
      updatePluginConfig: async (key, config) => {
        calls.configSaved.push({ key, config });
        return config;
      },
    },
    "@/lib/request": { trustedWrite: () => true },
    "next/server": {
      NextResponse: class {
        static json(data, init) {
          return new FakeResponse(data, init?.status ?? 200);
        }
      },
      NextRequest: class {},
    },
  });
  const route = h.load("app/api/admin/plugins/route.ts");
  return { route, calls };
}

test("ruta: sin settings:write, GET y toggle responden 403 y no tocan nada", async () => {
  const { route, calls } = routeSetup({ permissions: ["tickets:view"] });
  const list = await route.GET();
  assert.equal(list.status, 403);
  const toggle = await route.POST(fakeReq({ action: "toggle", key: "stripe", enabled: true }));
  assert.equal(toggle.status, 403);
  assert.equal(calls.toggled.length, 0);
});

test("ruta: sin sesión, GET y toggle responden 401", async () => {
  const { route, calls } = routeSetup({ session: false });
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(fakeReq({ action: "toggle", key: "stripe", enabled: true }))).status, 401);
  assert.equal(calls.toggled.length, 0);
});

test("ruta: GET nunca devuelve secretos ni su referencia", async () => {
  const { route } = routeSetup();
  const res = await route.GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /sk_test_NUNCA_DEBE_SALIR/);
  assert.doesNotMatch(serialized, /secretRef|secretValue/);
  assert.equal(body.plugins[0].hasSecrets, true);
  assert.equal(body.plugins[0].config.mode, "sandbox");
});

test("ruta: toggle con permiso llama a la librería y devuelve el plugin", async () => {
  const { route, calls } = routeSetup();
  const res = await route.POST(fakeReq({ action: "toggle", key: "stripe", enabled: true }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls.toggled, [{ key: "stripe", enabled: true }]);
  const body = await res.json();
  assert.equal(body.plugin.key, "stripe");
  assert.equal(body.plugin.enabled, true);
});

test("ruta: acción desconocida o plugin sin clave responden 400", async () => {
  const { route } = routeSetup();
  assert.equal((await route.POST(fakeReq({ action: "inventada", key: "stripe" }))).status, 400);
  assert.equal((await route.POST(fakeReq({ action: "toggle" }))).status, 400);
});
