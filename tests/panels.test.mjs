// Paneles por servicio (Fase 4, frente A): terminate/unsuspend en WHM con
// stub de writeWhm, dispatcher por panelKey, panel por defecto "whm" y
// rechazo de paneles inválidos. Servidores, tokens y dominios son señuelos.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const HOST = "https://whm.example.net:2087";
const TOKEN = "TEST_ONLY_WRITE_TOKEN_CANARY_987654321";

/* ------------------------------ WHM: escritura ------------------------------ */

test("WHM_WRITE_ACTIONS admite terminateacct y unsuspendacct, y sigue rechazando removeacct", () => {
  const h = loader({});
  const write = h.load("lib/whm-write.ts");
  assert.deepEqual(
    [...write.WHM_WRITE_ACTIONS].sort(),
    ["createacct", "suspendacct", "terminateacct", "unsuspendacct"],
  );
  assert.throws(
    () => write.assertWriteAction("removeacct"),
    (error) => error.name === "WhmError" && error.code === "invalid",
  );
});

test("parseWriteResponse cubre terminateacct y unsuspendacct sin usuario y sin 'Cuenta creada.'", () => {
  const h = loader({});
  const write = h.load("lib/whm-write.ts");
  for (const [action, fallback] of [
    ["terminateacct", "Cuenta terminada."],
    ["unsuspendacct", "Cuenta reactivada."],
  ]) {
    const parsed = write.parseWriteResponse(
      { metadata: { result: 1, command: action, version: 1, reason: "" }, data: null },
      action,
      TOKEN,
    );
    assert.equal(parsed.user, "");
    assert.equal(parsed.statusmsg, fallback);
  }
  // Con motivo del servidor, manda el motivo.
  const parsed = write.parseWriteResponse(
    { metadata: { result: 1, command: "terminateacct", version: 1, reason: "OK" }, data: null },
    "terminateacct",
    TOKEN,
  );
  assert.equal(parsed.statusmsg, "OK");
});

/* ------------------------------ WHM: suspender/reactivar/terminar ------------------------------ */

function provisionModule(mocks = {}) {
  const state = { writes: [], events: [], updates: [] };
  const services = {
    "svc-1": {
      id: "svc-1",
      status: "cancelled",
      panelKey: "whm",
      panelAccountId: "miti1a2b",
      cpanelUser: "miti1a2b",
      provisionError: "un fallo anterior",
    },
    ...(mocks.services ?? {}),
  };
  const db = {
    customerService: {
      findUnique: async ({ where }) =>
        services[where.id] ? { ...services[where.id] } : null,
      update: async ({ where, data }) => {
        state.updates.push({ where, data });
        Object.assign(services[where.id], data);
        return { ...services[where.id] };
      },
      updateMany: async () => ({ count: 1 }),
    },
    integrationConfig: {
      findUnique: async () => ({
        id: "whm-provision",
        endpoint: HOST,
        encryptedCredentials: "sealed",
      }),
    },
    provisionSetting: {
      findUnique: async () =>
        mocks.setting ?? { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
    },
    commerceEvent: {
      create: async ({ data }) => {
        state.events.push(data);
        return data;
      },
    },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(db),
  };
  class SecretBoxError extends Error {
    constructor(code) {
      super(`secret-box:${code}`);
      this.code = code;
    }
  }
  const h = loader({
    "@/lib/db": { db },
    "@/lib/mailer": {
      mailerConfigured: () => true,
      deliverNotice: async () => ({ delivered: true, reason: "sink" }),
    },
    "@/lib/secret-box": {
      sealSecret: (aad, plaintext) =>
        `sealed:${aad}:${Buffer.from(plaintext, "utf8").toString("base64")}`,
      openSecret: (aad, value) => {
        if (value === "sealed") return JSON.stringify({ username: "root", token: TOKEN });
        if (typeof value === "string" && value.startsWith(`sealed:${aad}:`)) {
          return Buffer.from(value.slice(`sealed:${aad}:`.length), "base64").toString("utf8");
        }
        throw new SecretBoxError("data");
      },
      SecretBoxError,
    },
    "@/lib/whm": {
      decryptWhm: () => ({ username: "root", token: TOKEN }),
    },
    "@/lib/whm-transport": {
      readWhm: async () => ({ rows: [], total: 0, truncated: false }),
    },
    "@/lib/whm-write": {
      writeWhm: async (endpoint, credentials, action, params) => {
        state.writes.push({ endpoint, action, params });
        if (mocks.writeThrowsCode) {
          const WhmError = h.load("lib/whm-security.ts").WhmError;
          throw new WhmError(mocks.writeThrowsCode);
        }
        return { statusmsg: "ok", user: params.username ?? params.user ?? "" };
      },
    },
  });
  return { provision: h.load("lib/whm-provision.ts"), state, services };
}

test("unsuspendServiceAccount llama unsuspendacct y registra service.unsuspended", async () => {
  const { provision, state } = provisionModule();
  const result = await provision.unsuspendServiceAccount({ serviceId: "svc-1", actor: "admin@example.com" });
  // El resultado viene del reino de la VM: se compara campo a campo, no con deepEqual.
  assert.equal(result.attempted, true);
  assert.equal(result.unsuspended, true);
  assert.equal(result.reason, "Cuenta cPanel miti1a2b reactivada en WHM.");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].action, "unsuspendacct");
  assert.equal(state.writes[0].params.user, "miti1a2b");
  assert.ok(state.events.some((event) => event.action === "service.unsuspended"));
  // El éxito limpia el provisionError anterior.
  assert.ok(state.updates.some((update) => update.data.provisionError === null));
});

test("terminateServiceAccount llama terminateacct con keepdns=0 y borra el usuario guardado", async () => {
  const { provision, state, services } = provisionModule();
  const result = await provision.terminateServiceAccount({ serviceId: "svc-1", actor: "admin@example.com" });
  assert.equal(result.attempted, true);
  assert.equal(result.terminated, true);
  assert.equal(result.reason, "Cuenta cPanel miti1a2b terminada en WHM.");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].action, "terminateacct");
  assert.equal(state.writes[0].params.user, "miti1a2b");
  assert.equal(state.writes[0].params.keepdns, "0");
  assert.ok(state.events.some((event) => event.action === "service.terminated"));
  assert.equal(services["svc-1"].cpanelUser, null);
  assert.equal(services["svc-1"].panelAccountId, null);
});

test("si WHM rechaza la terminación, el motivo avisa de la ACL y no se borra nada", async () => {
  const { provision, state, services } = provisionModule({ writeThrowsCode: "rejected" });
  const result = await provision.terminateServiceAccount({ serviceId: "svc-1", actor: "admin@example.com" });
  assert.equal(result.attempted, true);
  assert.equal(result.terminated, false);
  assert.match(result.reason, /NO se terminó/);
  assert.match(result.reason, /ACL necesaria/);
  assert.ok(state.events.some((event) => event.action === "service.terminate_failed"));
  assert.equal(services["svc-1"].cpanelUser, "miti1a2b");
});

test("sin cuenta en ningún panel no se intenta nada en WHM", async () => {
  const { provision, state } = provisionModule({
    services: {
      "svc-2": { id: "svc-2", status: "active", panelKey: "whm", panelAccountId: null, cpanelUser: null },
    },
  });
  const unsuspended = await provision.unsuspendServiceAccount({ serviceId: "svc-2", actor: "admin@example.com" });
  assert.equal(unsuspended.attempted, false);
  assert.equal(unsuspended.unsuspended, false);
  assert.equal(unsuspended.reason, "sin cuenta cPanel");
  const terminated = await provision.terminateServiceAccount({ serviceId: "svc-2", actor: "admin@example.com" });
  assert.equal(terminated.attempted, false);
  assert.equal(terminated.terminated, false);
  assert.equal(terminated.reason, "sin cuenta cPanel");
  assert.equal(state.writes.length, 0);
});

test("con el alta desactivada, reactivar queda como skipped con el motivo visible", async () => {
  const { provision, state } = provisionModule({
    setting: { enabled: false, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
  });
  const result = await provision.unsuspendServiceAccount({ serviceId: "svc-1", actor: "admin@example.com" });
  assert.equal(result.attempted, false);
  assert.equal(result.unsuspended, false);
  assert.match(result.reason, /sigue suspendida/);
  assert.ok(state.events.some((event) => event.action === "service.unsuspend_skipped"));
  assert.equal(state.writes.length, 0);
});

test("parsePanelMap solo acepta whm/plesk/directadmin/none y panelFor usa whm por defecto", () => {
  const { provision } = provisionModule();
  // El mapa viene del reino de la VM: se compara como texto, no con deepEqual.
  assert.equal(
    JSON.stringify(provision.parsePanelMap({
      "plan-ok": "plesk",
      "plan-none": "none",
      "plan-malo": "cpanelX",
      "plan-otro": 42,
      "plan malo": "whm",
    })),
    JSON.stringify({ "plan-ok": "plesk", "plan-none": "none" }),
  );
  assert.equal(provision.panelFor({ panelByPlan: { "plan-ok": "plesk" } }, "plan-ok"), "plesk");
  assert.equal(provision.panelFor({ panelByPlan: {} }, "plan-basico"), "whm");
  assert.equal(provision.isPanelKey("directadmin"), true);
  assert.equal(provision.isPanelKey("otro"), false);
});

/* ------------------------------ dispatcher por servicio ------------------------------ */

function panelsModule(mocks = {}) {
  const state = { events: [], updates: [], calls: [] };
  const services = {
    "svc-whm": { id: "svc-whm", panelKey: "whm", panelAccountId: null, cpanelUser: "miti1a2b" },
    "svc-legacy": { id: "svc-legacy", panelKey: null, panelAccountId: null, cpanelUser: "legado12" },
    "svc-plesk": { id: "svc-plesk", panelKey: "plesk", panelAccountId: "pleskuser", cpanelUser: "miti1a2b" },
    "svc-none": { id: "svc-none", panelKey: "none", panelAccountId: null, cpanelUser: null },
    "svc-bad": { id: "svc-bad", panelKey: "cpanelX", panelAccountId: null, cpanelUser: null },
    ...(mocks.services ?? {}),
  };
  const db = {
    customerService: {
      findUnique: async ({ where }) =>
        services[where.id] ? { ...services[where.id] } : null,
      update: async ({ where, data }) => {
        state.updates.push({ where, data });
        Object.assign(services[where.id], data);
        return { ...services[where.id] };
      },
    },
    commerceEvent: {
      create: async ({ data }) => {
        state.events.push(data);
        return data;
      },
    },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(db),
  };
  const h = loader({
    "@/lib/db": { db },
    "@/lib/audit-sanitize": {
      sanitizeAudit: (value) => (typeof value === "string" ? value : JSON.stringify(value)),
    },
    "@/lib/whm-provision": {
      isPanelKey: (value) => ["whm", "plesk", "directadmin", "none"].includes(value),
      suspendServiceAccount: async ({ serviceId }) => {
        state.calls.push({ fn: "suspendServiceAccount", serviceId });
        return mocks.whmSuspend ?? { attempted: true, suspended: true, reason: "Cuenta cPanel miti1a2b suspendida en WHM." };
      },
      unsuspendServiceAccount: async ({ serviceId }) => {
        state.calls.push({ fn: "unsuspendServiceAccount", serviceId });
        return mocks.whmUnsuspend ?? { attempted: true, unsuspended: true, reason: "Cuenta cPanel miti1a2b reactivada en WHM." };
      },
      terminateServiceAccount: async ({ serviceId }) => {
        state.calls.push({ fn: "terminateServiceAccount", serviceId });
        return mocks.whmTerminate ?? { attempted: true, terminated: true, reason: "Cuenta cPanel miti1a2b terminada en WHM." };
      },
    },
    "./whm-panel": {
      whmPanel: { key: "whm" },
    },
    "./plesk": {
      pleskPanel: {
        key: "plesk",
        suspendAccount: async (input) => {
          state.calls.push({ fn: "plesk.suspendAccount", ...input });
          if (mocks.pleskThrows) throw new Error("Plesk no responde");
        },
        unsuspendAccount: async (input) => {
          state.calls.push({ fn: "plesk.unsuspendAccount", ...input });
        },
        terminateAccount: async (input) => {
          state.calls.push({ fn: "plesk.terminateAccount", ...input });
        },
      },
    },
    "./directadmin": {
      directAdminPanel: {
        key: "directadmin",
        suspendAccount: async (input) => {
          state.calls.push({ fn: "directadmin.suspendAccount", ...input });
        },
        unsuspendAccount: async (input) => {
          state.calls.push({ fn: "directadmin.unsuspendAccount", ...input });
        },
        terminateAccount: async (input) => {
          state.calls.push({ fn: "directadmin.terminateAccount", ...input });
        },
      },
    },
  });
  return { panels: h.load("lib/panels.ts"), state, services };
}

test("getControlPanel resuelve cada panel, none es null y otro lanza", () => {
  const { panels } = panelsModule();
  assert.equal(panels.getControlPanel("whm").key, "whm");
  assert.equal(panels.getControlPanel("plesk").key, "plesk");
  assert.equal(panels.getControlPanel("directadmin").key, "directadmin");
  assert.equal(panels.getControlPanel("none"), null);
  assert.throws(() => panels.getControlPanel("otro"), /Panel no válido/);
});

test("panelKey por defecto es whm: un servicio sin panelKey suspende en WHM", async () => {
  const { panels, state } = panelsModule();
  const result = await panels.suspendServicePanel({ serviceId: "svc-legacy", actor: "admin@example.com" });
  assert.equal(result.suspended, true);
  assert.deepEqual(state.calls, [{ fn: "suspendServiceAccount", serviceId: "svc-legacy" }]);
});

test("el dispatcher usa el panel del servicio: Plesk suspende con su usuario", async () => {
  const { panels, state } = panelsModule();
  const result = await panels.suspendServicePanel({ serviceId: "svc-plesk", actor: "admin@example.com" });
  assert.equal(result.suspended, true);
  assert.match(result.reason, /Plesk/);
  assert.deepEqual(state.calls, [{ fn: "plesk.suspendAccount", username: "pleskuser", reason: "Suspendido en CaluServers" }]);
  assert.ok(state.events.some((event) => event.action === "service.suspended"));
});

test("terminar en Plesk borra el usuario guardado del servicio", async () => {
  const { panels, state, services } = panelsModule();
  const result = await panels.terminateServicePanel({ serviceId: "svc-plesk", actor: "admin@example.com" });
  assert.equal(result.terminated, true);
  assert.deepEqual(state.calls, [{ fn: "plesk.terminateAccount", username: "pleskuser" }]);
  assert.equal(services["svc-plesk"].panelAccountId, null);
  assert.equal(services["svc-plesk"].cpanelUser, null);
});

test("si el panel del servicio falla, el dispatcher devuelve el motivo sin lanzar", async () => {
  const { panels, state } = panelsModule({ pleskThrows: true });
  const result = await panels.suspendServicePanel({ serviceId: "svc-plesk", actor: "admin@example.com" });
  assert.equal(result.attempted, true);
  assert.equal(result.suspended, false);
  assert.match(result.reason, /Plesk no responde/);
  assert.ok(state.events.some((event) => event.action === "service.suspend_failed"));
});

test("sin cuenta en ningún panel no se intenta nada y queda el motivo", async () => {
  const { panels, state } = panelsModule();
  const result = await panels.suspendServicePanel({ serviceId: "svc-none", actor: "admin@example.com" });
  assert.equal(result.attempted, false);
  assert.equal(result.suspended, false);
  assert.equal(result.reason, "sin cuenta en ningún panel");
  assert.equal(state.calls.length, 0);
  assert.ok(state.events.some((event) => event.action === "service.suspend_skipped"));
});

test("un panelKey inválido guardado se rechaza sin tocar ningún panel", async () => {
  const { panels, state } = panelsModule();
  const result = await panels.terminateServicePanel({ serviceId: "svc-bad", actor: "admin@example.com" });
  assert.equal(result.attempted, false);
  assert.equal(result.terminated, false);
  assert.match(result.reason, /Panel no válido/);
  assert.equal(state.calls.length, 0);
});

test("panelAccountUser: en WHM vale el cpanelUser heredado; fuera, solo panelAccountId", () => {
  const { panels } = panelsModule();
  assert.equal(panels.panelAccountUser({ panelKey: "whm", panelAccountId: null, cpanelUser: "miti1a2b" }), "miti1a2b");
  assert.equal(panels.panelAccountUser({ panelKey: "plesk", panelAccountId: null, cpanelUser: "miti1a2b" }), null);
  assert.equal(panels.panelAccountUser({ panelKey: "plesk", panelAccountId: "pleskuser", cpanelUser: "miti1a2b" }), "pleskuser");
  assert.equal(panels.panelLabel("directadmin"), "DirectAdmin");
  assert.equal(panels.panelLabel("none"), "Sin panel");
  assert.equal(panels.panelLabel(null), "WHM");
});

/* ------------------------------ adaptador WHM ------------------------------ */

function whmPanelModule(mocks = {}) {
  const state = { writes: [], reads: [] };
  const db = {
    integrationConfig: {
      findUnique: async ({ where }) =>
        where.id === "whm-provision"
          ? { id: "whm-provision", endpoint: HOST, encryptedCredentials: "sealed" }
          : { id: "whm", endpoint: HOST, encryptedCredentials: "sealed-read" },
    },
    provisionSetting: {
      findUnique: async () =>
        mocks.setting ?? { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
    },
    customerService: {
      update: async ({ data }) => data,
    },
    commerceEvent: {
      create: async ({ data }) => data,
    },
  };
  const h = loader({
    "@/lib/db": { db },
    "@/lib/whm": {
      decryptWhm: () => ({ username: "root", token: TOKEN }),
    },
    "@/lib/whm-transport": {
      readWhm: async (_endpoint, _credentials, action) => {
        state.reads.push(action);
        if (action === "listaccts") {
          return { rows: [{ user: "miti1a2b", domain: "midominio.com", suspended: "1" }], total: 1, truncated: false };
        }
        return { rows: [{ name: "basico" }], total: 1, truncated: false };
      },
    },
    "@/lib/whm-write": {
      writeWhm: async (endpoint, credentials, action, params) => {
        state.writes.push({ action, params });
        return { statusmsg: "ok", user: params.username ?? params.user ?? "" };
      },
    },
    "@/lib/whm-provision": {
      provisionConfiguration: async () => ({
        enabled: mocks.setting?.enabled ?? true,
        hasToken: true,
        url: HOST,
        packageName: "basico",
        packageByPlan: {},
        panelByPlan: {},
      }),
      decryptProvisionCredentials: () => ({ username: "root", token: TOKEN }),
      suspendWhmAccount: async ({ username }) => {
        state.writes.push({ action: "suspendacct", params: { user: username } });
        return { attempted: true, suspended: true, reason: `Cuenta cPanel ${username} suspendida en WHM.` };
      },
      unsuspendWhmAccount: async ({ username }) => {
        state.writes.push({ action: "unsuspendacct", params: { user: username } });
        return { attempted: true, unsuspended: true, reason: `Cuenta cPanel ${username} reactivada en WHM.` };
      },
      terminateWhmAccount: async ({ username }) => {
        state.writes.push({ action: "terminateacct", params: { user: username, keepdns: "0" } });
        return { attempted: true, terminated: true, reason: `Cuenta cPanel ${username} terminada en WHM.` };
      },
    },
  });
  return { panel: h.load("lib/whm-panel.ts").whmPanel, state };
}

test("whmPanel.createAccount llama createacct con los datos dados", async () => {
  const { panel, state } = whmPanelModule();
  const created = await panel.createAccount({
    domain: "midominio.com",
    username: "miti1a2b",
    password: "Secreta-1234",
    plan: "basico",
    email: "cliente@example.com",
  });
  assert.equal(created.username, "miti1a2b");
  assert.equal(created.domain, "midominio.com");
  assert.equal(state.writes[0].action, "createacct");
  assert.equal(state.writes[0].params.plan, "basico");
});

test("whmPanel.changePackage lanza not-supported honesto", async () => {
  const { panel } = whmPanelModule();
  await assert.rejects(
    () => panel.changePackage({ username: "miti1a2b", plan: "pro" }),
    /not-supported/,
  );
});

test("whmPanel lista cuentas y paquetes por lectura", async () => {
  const { panel, state } = whmPanelModule();
  // Las listas vienen del reino de la VM: se comparan como texto.
  assert.equal(
    JSON.stringify(await panel.listAccounts()),
    JSON.stringify([{ username: "miti1a2b", domain: "midominio.com", suspended: true }]),
  );
  assert.equal(
    JSON.stringify(await panel.listPackages()),
    JSON.stringify([{ name: "basico" }]),
  );
  assert.deepEqual(state.reads, ["listaccts", "listpkgs"]);
});
