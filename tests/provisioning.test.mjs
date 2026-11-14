// Tests del aprovisionamiento automático (pedido -> pago confirmado ->
// cuenta WHM). Todo con dobles en memoria: nunca se toca un WHM real ni
// una base de datos real. El módulo bajo prueba se carga con el mismo
// cargador VM que tests/whm.test.mjs (transpila TS, mocks de red/BD).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createHmac } from "node:crypto";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "ab".repeat(32);
const WEBHOOK_SECRET = "test-webhook-secret";

function loader(mocks = {}) {
  const cache = new Map();
  function load(name) {
    const file = resolve(root, name);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (id.startsWith("@/") || id.startsWith(".")) {
        let path = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(file), id);
        if (!existsSync(path))
          path += existsSync(path + ".ts") ? ".ts" : ".tsx";
        return load(path);
      }
      return require(id);
    }
    runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        require: localRequire,
        URL,
        URLSearchParams,
        Buffer,
        structuredClone,
        console,
        setTimeout,
        clearTimeout,
        process: {
          env: {
            SETTINGS_ENCRYPTION_KEY: KEY,
            NODE_ENV: "production",
            PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
            ...mocks.env,
          },
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  return { load };
}

function memoryStore() {
  const orders = new Map();
  const accounts = new Map();
  let seq = 0;
  const clone = (o) => ({ ...o });
  return {
    orders,
    accounts,
    async findById(id) {
      const o = orders.get(id);
      return o ? clone(o) : null;
    },
    async findByNumber(number) {
      for (const o of orders.values())
        if (o.number === number) return clone(o);
      return null;
    },
    async findByLookupToken(token) {
      for (const o of orders.values())
        if (o.lookupToken === token) return clone(o);
      return null;
    },
    async findPendingDuplicate(email, domain, planId) {
      for (const o of orders.values())
        if (
          o.customerEmail === email &&
          o.domain === domain &&
          o.planId === planId &&
          o.status === "pending_payment"
        )
          return clone(o);
      return null;
    },
    async create(data) {
      const now = new Date();
      const order = {
        id: `ord-${++seq}`,
        lookupToken: `tok-${seq}`,
        paymentRef: null,
        paidAt: null,
        paidVia: null,
        whmUsername: null,
        whmPackage: data.whmPackage ?? null,
        provisionAttempts: 0,
        provisionError: null,
        status: "pending_payment",
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      orders.set(order.id, order);
      return clone(order);
    },
    async claimPaid(id, paymentRef, paidVia) {
      const o = orders.get(id);
      if (!o || o.status !== "pending_payment") return null;
      o.status = "paid";
      o.paymentRef = paymentRef;
      o.paidVia = paidVia;
      o.paidAt = new Date();
      return clone(o);
    },
    async claimProvisioning(id) {
      const o = orders.get(id);
      if (!o || o.status !== "paid") return null;
      o.status = "provisioning";
      o.provisionAttempts += 1;
      return clone(o);
    },
    async markActive(id, whmUsername) {
      const o = orders.get(id);
      o.status = "active";
      o.whmUsername = whmUsername;
      return clone(o);
    },
    async markFailed(id, error) {
      const o = orders.get(id);
      o.status = "provision_failed";
      o.provisionError = error;
      return clone(o);
    },
    async resetToPaid(id) {
      const o = orders.get(id);
      if (!o || o.status !== "provision_failed") return null;
      o.status = "paid";
      o.provisionError = null;
      return clone(o);
    },
    async createHostingAccount(data) {
      accounts.set(data.orderId, { ...data, status: "active" });
    },
    async usernameTaken(username, exceptOrderId) {
      for (const o of orders.values())
        if (o.whmUsername === username && o.id !== exceptOrderId) return true;
      for (const [orderId, a] of accounts)
        if (a.whmUsername === username && orderId !== exceptOrderId)
          return true;
      return false;
    },
  };
}

function fakeWhm({ failWith = null, existing = new Map(), WhmError }) {
  const calls = [];
  const api = {
    calls,
    existing,
    failWith,
    async createAccount(input) {
      calls.push({ ...input });
      if (api.failWith) throw api.failWith;
      if (existing.has(input.username)) throw new WhmError("conflict");
      existing.set(input.username, input.domain);
    },
    async findAccount(username) {
      const domain = existing.get(username);
      return domain ? { domain } : null;
    },
  };
  return api;
}

function loadProvisioning() {
  const { load } = loader({
    "@/lib/db": { db: {} },
    "@/lib/whm-management": {},
    "@/lib/whm": {},
    "@/lib/whm-transport": {},
  });
  const provisioning = load("lib/provisioning.ts");
  const { WhmError } = load("lib/whm-security.ts");
  return { provisioning, WhmError };
}

const ORDER_INPUT = {
  customerName: "Cliente Prueba",
  customerEmail: "cliente@prueba.test",
  domain: "midominio.com",
  planId: "wh1",
  planName: "Calu Professional",
  planCategory: "web",
  price: "$6.99",
  whmPackage: "Calu Professional",
};

test("deriveWhmUsernameBase respeta las reglas de WHM", () => {
  const { provisioning } = loadProvisioning();
  assert.equal(provisioning.deriveWhmUsernameBase("midominio.com"), "midominio");
  assert.equal(provisioning.deriveWhmUsernameBase("Mi-Dominio.com"), "midominio");
  assert.equal(provisioning.deriveWhmUsernameBase("123abc.com"), "abc");
  assert.equal(provisioning.deriveWhmUsernameBase("test.com"), "htest");
  assert.equal(provisioning.deriveWhmUsernameBase("a.io"), "a");
  assert.equal(
    provisioning.deriveWhmUsernameBase("undominiomuylargo.com"),
    "undominiomuylarg",
  );
});

test("deriveHostingPassword es determinista y cumple las reglas", () => {
  const { provisioning } = loadProvisioning();
  const a = provisioning.deriveHostingPassword("ord-1", "midominio");
  const b = provisioning.deriveHostingPassword("ord-1", "midominio");
  assert.equal(a, b);
  assert.equal(a.length, 20);
  assert.match(a, /[a-z]/);
  assert.match(a, /[A-Z]/);
  assert.match(a, /[0-9]/);
  assert.match(a, /[!@#$%^&*+\-_=]/);
  assert.ok(!a.toLowerCase().includes("midominio"));
  assert.notEqual(
    a,
    provisioning.deriveHostingPassword("ord-1", "otrousuario"),
  );
});

test("cifrar/descifrar la contraseña de hosting es simétrico", () => {
  const { provisioning } = loadProvisioning();
  const plain = provisioning.deriveHostingPassword("ord-1", "midominio");
  const enc = provisioning.encryptProvisioningSecret(plain);
  assert.notEqual(enc, plain);
  assert.equal(provisioning.decryptProvisioningSecret(enc), plain);
  assert.throws(() =>
    provisioning.decryptProvisioningSecret("v1:00:00:00"),
  );
});

test("firma de webhook HMAC: válida, inválida y sin secreto", () => {
  const { provisioning } = loadProvisioning();
  const raw = JSON.stringify({ orderNumber: "CS-ABC", status: "paid" });
  const sig =
    "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
  assert.equal(provisioning.verifyWebhookSignature(raw, sig), true);
  assert.equal(
    provisioning.verifyWebhookSignature(raw, "sha256=00"),
    false,
  );
  assert.equal(provisioning.verifyWebhookSignature(raw, null), false);
  assert.equal(
    provisioning.verifyWebhookSignature(raw, sig, ""),
    false,
  );
});

test("resolveWhmPackage y URL de cPanel", () => {
  const { provisioning } = loadProvisioning();
  assert.equal(
    provisioning.resolveWhmPackage("wh1", "Calu Professional"),
    "Calu Professional",
  );
  assert.equal(
    provisioning.resolveWhmPackage("wh1", "Calu Professional", {
      wh1: "profesional",
    }),
    "profesional",
  );
  assert.equal(
    provisioning.cpanelUrlFromWhmEndpoint("https://host.example.net:2087"),
    "https://host.example.net:2083/",
  );
  assert.equal(
    provisioning.cpanelUrlFromWhmEndpoint("http://host.example.net:2087"),
    null,
  );
  assert.match(provisioning.generateOrderNumber(), /^CS-[0-9A-F]{8}$/);
});

test("doble envío de checkout no duplica el pedido pendiente", async () => {
  const { provisioning } = loadProvisioning();
  const store = memoryStore();
  const deps = { store, whm: fakeWhm({ WhmError: class extends Error {} }) };
  const first = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const second = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  assert.equal(first.id, second.id);
  assert.equal(store.orders.size, 1);
  assert.equal(first.status, "pending_payment");
});

test("confirmar el pago crea la cuenta WHM y activa el pedido", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  const whm = fakeWhm({ WhmError });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const result = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-1", paidVia: "admin" },
    deps,
  );
  assert.equal(result.alreadyConfirmed, false);
  assert.equal(result.provisioned, true);
  assert.equal(result.order.status, "active");
  assert.equal(result.order.whmUsername, "midominio");
  assert.equal(whm.calls.length, 1);
  assert.equal(whm.calls[0].username, "midominio");
  assert.equal(whm.calls[0].domain, "midominio.com");
  assert.equal(whm.calls[0].plan, "Calu Professional");
  const account = store.accounts.get(order.id);
  assert.ok(account);
  assert.equal(account.whmUsername, "midominio");
  assert.equal(account.package, "Calu Professional");
  assert.equal(
    provisioning.decryptProvisioningSecret(account.encryptedPassword),
    whm.calls[0].password,
  );
});

test("confirmar el mismo pago dos veces no crea una segunda cuenta", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  const whm = fakeWhm({ WhmError });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const first = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-1", paidVia: "webhook" },
    deps,
  );
  const second = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-1", paidVia: "webhook" },
    deps,
  );
  assert.equal(first.provisioned, true);
  assert.equal(second.alreadyConfirmed, true);
  assert.equal(second.provisioned, true);
  assert.equal(whm.calls.length, 1);
  assert.equal(store.accounts.size, 1);
});

test("fallo de WHM deja el pedido en provision_failed y el reintento funciona", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  const whm = fakeWhm({ WhmError, failWith: new Error("boom") });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const failed = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-2", paidVia: "admin" },
    deps,
  );
  assert.equal(failed.provisioned, false);
  assert.equal(failed.order.status, "provision_failed");
  assert.ok(failed.order.provisionError);
  assert.equal(failed.order.provisionAttempts, 1);
  assert.equal(whm.calls.length, 1);
  // Reintento con WHM ya disponible.
  whm.failWith = null;
  const retried = await provisioning.retryProvisioning(order.id, deps);
  assert.equal(retried.ok, true);
  assert.equal(retried.order.status, "active");
  assert.equal(retried.order.provisionAttempts, 2);
  assert.equal(whm.calls.length, 2);
});

test("conflicto con cuenta nuestra adopta la cuenta existente", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  // La cuenta ya existe en WHM con el mismo dominio (intento anterior incierto).
  const existing = new Map([["midominio", "midominio.com"]]);
  const whm = fakeWhm({ WhmError, existing });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const result = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-3", paidVia: "webhook" },
    deps,
  );
  assert.equal(result.provisioned, true);
  assert.equal(result.order.status, "active");
  assert.equal(result.order.whmUsername, "midominio");
  assert.equal(whm.calls.length, 1);
  assert.ok(store.accounts.get(order.id));
});

test("conflicto con cuenta de otro cliente usa un usuario con sufijo", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  const existing = new Map([["midominio", "otrodominio.com"]]);
  const whm = fakeWhm({ WhmError, existing });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const result = await provisioning.confirmPayment(
    order.id,
    { paymentRef: "PAY-4", paidVia: "admin" },
    deps,
  );
  assert.equal(result.provisioned, true);
  assert.notEqual(result.order.whmUsername, "midominio");
  assert.match(result.order.whmUsername, /^midominio_[0-9a-f]{2}$/);
  assert.equal(whm.calls.length, 1);
  assert.equal(whm.calls[0].username, result.order.whmUsername);
});

test("aprovisionar un pedido sin pagar no llama a WHM", async () => {
  const { provisioning, WhmError } = loadProvisioning();
  const store = memoryStore();
  const whm = fakeWhm({ WhmError });
  const deps = { store, whm };
  const order = await provisioning.createOrderRecord(ORDER_INPUT, deps);
  const result = await provisioning.provisionOrder(order.id, deps);
  assert.equal(result.ok, false);
  assert.equal(result.alreadyInFlight, true);
  assert.equal(whm.calls.length, 0);
  assert.equal((await store.findById(order.id)).status, "pending_payment");
});
