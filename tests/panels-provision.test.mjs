// Alta genérica por adaptador (Fase 5, frente A): provisionService cableado a
// getControlPanel — Plesk y DirectAdmin con transporte falso, fallo del panel
// con motivo visible + reintento manual, WHM sin cambios y panel "none" con
// fallo explícito. Servidores, tokens y dominios son señuelos locales;
// ningún panel real se toca.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const HOST = "https://whm.example.net:2087";
const TOKEN = "TEST_ONLY_WRITE_TOKEN_CANARY_987654321";

class OutboundError extends Error {
  constructor(code) {
    super(`outbound:${code}`);
    this.name = "OutboundError";
    this.code = code;
  }
}

/* ------------------------------ fixtures de panel ------------------------------ */

const PLESK_OK = (inner) => ({
  status: 200,
  text: `<?xml version="1.0" encoding="UTF-8"?><packet version="1.6.7.0">${inner}</packet>`,
});

/**
 * Transporte Plesk falso. El primer `<webspace><add>` puede fallar (errcode
 * 1013) para probar el fallo + reintento; el segundo intento ve el login ya
 * existente (errcode 1007) y lo reutiliza, como hace el adaptador real.
 */
function pleskFake({ failFirstWebspace = false } = {}) {
  let customerAdds = 0;
  let webspaceAdds = 0;
  return async ({ body }) => {
    if (body.includes("<customer><add>")) {
      customerAdds += 1;
      if (customerAdds > 1) {
        return PLESK_OK(
          `<customer><add><result><status>error</status><errcode>1007</errcode><errtext>login duplicado</errtext></result></add></customer>`,
        );
      }
      return PLESK_OK(
        `<customer><add><result><status>ok</status><id>42</id></result></add></customer>`,
      );
    }
    if (body.includes("<customer><get>")) {
      return PLESK_OK(
        `<customer><get><result><status>ok</status><id>42</id></result></get></customer>`,
      );
    }
    if (body.includes("<webspace><add>")) {
      webspaceAdds += 1;
      if (failFirstWebspace && webspaceAdds === 1) {
        return PLESK_OK(
          `<webspace><add><result><status>error</status><errcode>1013</errcode><errtext>plan no válido</errtext></result></add></webspace>`,
        );
      }
      return PLESK_OK(
        `<webspace><add><result><status>ok</status><id>4</id></result></add></webspace>`,
      );
    }
    if (body.includes("<webspace><get>")) {
      // Adopción: sin suscripciones para ese usuario.
      return PLESK_OK(`<webspace><get></get></webspace>`);
    }
    throw new Error(`llamada Plesk inesperada: ${body.slice(0, 80)}`);
  };
}

/** Transporte DirectAdmin falso. El primer alta puede fallar (error=1). */
function daFake({ failFirstCreate = false } = {}) {
  let creates = 0;
  return async ({ url }) => {
    if (url.includes("/CMD_API_ACCOUNT_USER")) {
      creates += 1;
      if (failFirstCreate && creates === 1) {
        return { status: 200, text: "error=1&text=User+already+exists" };
      }
      return { status: 200, text: "error=0&text=User+created" };
    }
    if (url.includes("/CMD_API_SHOW_ALL_USERS")) {
      // Adopción: sin usuarios para ese dominio.
      return { status: 200, text: "" };
    }
    throw new Error(`llamada DirectAdmin inesperada: ${url}`);
  };
}

/* ------------------------------ el módulo ------------------------------ */

function provisionModule(mocks = {}) {
  const services = mocks.service ? { [mocks.service.id]: { ...mocks.service } } : {};
  const state = {
    services,
    updates: [],
    events: [],
    mail: [],
    writes: [],
    reads: [],
    configCalls: 0,
    listaccts: mocks.listaccts ?? null,
    updateManyResult: mocks.updateManyResult ?? 1,
  };
  const calls = { plesk: [], da: [] };
  const db = {
    customerService: {
      findUnique: async ({ where }) =>
        services[where.id] ? { ...services[where.id] } : null,
      updateMany: async (args) => {
        state.updates.push({ kind: "updateMany", ...args });
        const service = services[args.where.id];
        if (service) {
          if (typeof args.data.status === "string") service.status = args.data.status;
          if (args.data.provisionAttempts?.increment) {
            service.provisionAttempts = (service.provisionAttempts ?? 0) + 1;
          }
          if ("provisionError" in args.data) service.provisionError = args.data.provisionError;
          if (typeof args.data.note === "string") service.note = args.data.note;
        }
        return { count: state.updateManyResult };
      },
      update: async (args) => {
        state.updates.push({ kind: "update", ...args });
        Object.assign(services[args.where.id], args.data);
        return { id: args.where.id, ...args.data };
      },
    },
    integrationConfig: {
      findUnique: async () => {
        state.configCalls += 1;
        return mocks.credentials === null
          ? null
          : { id: "whm-provision", endpoint: HOST, encryptedCredentials: "sealed" };
      },
    },
    provisionSetting: {
      findUnique: async () => mocks.setting ?? null,
      upsert: async (args) => args,
    },
    user: {
      findUnique: async () =>
        "customer" in mocks ? mocks.customer : { email: "cliente@example.com", name: "Ana" },
    },
    customerInvoice: { findUnique: async () => mocks.invoice ?? null },
    commerceEvent: {
      create: async (args) => {
        state.events.push(args.data);
        return args.data;
      },
    },
    adminAudit: { create: async (args) => args },
    $transaction: async (operations) =>
      Array.isArray(operations) ? Promise.all(operations) : operations(db),
  };
  let whmError = null;
  const plugin = mocks.plugin ?? {};
  const h = loader({
    "@/lib/db": { db },
    "@/lib/mailer": {
      mailerConfigured: () => mocks.mailReady ?? true,
      deliverNotice: async (input) => {
        state.mail.push(input);
        if (mocks.mailThrows) throw new Error("smtp");
        return { delivered: mocks.mailDelivered ?? true, reason: "smtp" };
      },
    },
    "@/lib/secret-box": {
      sealSecret: (aad, plaintext) =>
        `sealed:${aad}:${Buffer.from(plaintext, "utf8").toString("base64")}`,
      openSecret: (aad, value) => {
        if (value === "sealed") return JSON.stringify({ username: "root", token: TOKEN });
        if (typeof value === "string" && value.startsWith("sealed:")) {
          const prefix = `sealed:${aad}:`;
          if (value.startsWith(prefix))
            return Buffer.from(value.slice(prefix.length), "base64").toString("utf8");
        }
        throw new SecretBoxError("data");
      },
      SecretBoxError: class SecretBoxError extends Error {
        constructor(code) {
          super(`secret-box:${code}`);
          this.code = code;
        }
      },
    },
    "@/lib/whm-write": {
      writeWhm: async (endpoint, credentials, action, params) => {
        state.writes.push({ endpoint, action, params });
        if (mocks.writeThrowsCode) throw new whmError(mocks.writeThrowsCode);
        return { statusmsg: "ok", user: params.username };
      },
    },
    "@/lib/whm-transport": {
      readWhm: async () => {
        state.reads.push({});
        if (mocks.readThrows) throw new Error("sin lectura");
        return state.listaccts ?? { rows: [], total: 0, truncated: false };
      },
    },
    "@/lib/whm": {
      decryptWhm: () => ({ username: "root", token: TOKEN }),
    },
    // Los adaptadores Plesk/DirectAdmin leen el plugin por estas tres
    // funciones; el transporte real nunca se usa (ver __set*Fetch).
    "./plugins": {
      isPluginEnabled: async (key) => plugin.enabled?.[key] ?? true,
      getPluginSecrets: async (key) =>
        plugin.secrets?.[key] ?? { login: "admin", password: "secreto-falso" },
      getPluginConfig: async (key) =>
        plugin.config?.[key] ??
        (key === "plesk"
          ? { url: "https://plesk.ejemplo:8443", mode: "login", ipAddress: "203.0.113.10" }
          : { url: "https://da.ejemplo:2222", ipAddress: "203.0.113.20" }),
    },
    "./outbound": {
      OutboundError,
      requestText: async () => {
        throw new Error("red real no permitida en la prueba");
      },
    },
    env: { PLESK_ENABLED: "true", DIRECTADMIN_ENABLED: "true", ...mocks.env },
  });
  const provision = h.load("lib/whm-provision.ts");
  whmError = h.load("lib/whm-security.ts").WhmError;
  if (mocks.pleskFake) {
    const plesk = h.load("lib/plesk.ts");
    plesk.__setPleskFetch(async (options) => {
      calls.plesk.push({ ...options });
      return mocks.pleskFake(options, calls.plesk);
    });
  }
  if (mocks.daFake) {
    const da = h.load("lib/directadmin.ts");
    da.__setDirectAdminFetch(async (options) => {
      calls.da.push({ ...options });
      return mocks.daFake(options, calls.da);
    });
  }
  return { provision, state, services, calls };
}

const PAID_SERVICE = {
  id: "svc_1",
  userId: "user_1",
  planId: "plan-basico",
  planName: "Hosting Básico",
  status: "pending_provision",
  cpanelUser: null,
  panelAccountId: null,
  panelKey: "plesk",
  order: {
    domain: "midominio.com",
    invoice: { payment: { status: "confirmed" } },
  },
};

const PLESK_SETTING = {
  enabled: true,
  packageName: "basico",
  packageByPlan: { "plan-basico": "base_plan" },
  panelByPlan: {},
};

const DA_SETTING = {
  enabled: true,
  packageName: "basico",
  packageByPlan: { "plan-basico": "paquete_da" },
  panelByPlan: {},
};

function releaseOf(state) {
  return state.updates.find(
    (update) => update.kind === "update" && update.data.status === "pending_provision",
  );
}

/* ------------------------------ Plesk ------------------------------ */

test("alta por Plesk con transporte falso: cliente + suscripción con plan e IP, sin tocar WHM", async () => {
  const { provision, state, services, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "plesk" },
    setting: PLESK_SETTING,
    pleskFake: pleskFake(),
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  const username = provision.cpanelUsername("svc_1", "midominio.com");
  assert.equal(result.status, "active");
  assert.equal(result.cpanelUser, username);
  assert.equal(result.credentialsSent, true);
  assert.equal(state.writes.length, 0, "WHM no se toca");
  assert.equal(state.configCalls, 0, "la configuración WHM no se consulta");
  assert.equal(calls.plesk.length, 2);
  const customerCall = calls.plesk[0].body;
  assert.match(customerCall, new RegExp(`<login>${username}</login>`));
  assert.match(customerCall, /<email>cliente@example\.com<\/email>/);
  const webspaceCall = calls.plesk[1].body;
  assert.match(webspaceCall, /<name>midominio\.com<\/name>/);
  assert.match(webspaceCall, /<owner-id>42<\/owner-id>/);
  assert.match(webspaceCall, /<ip_address>203\.0\.113\.10<\/ip_address>/);
  assert.match(webspaceCall, /<plan-name>base_plan<\/plan-name>/);
  // La contraseña es la misma en Plesk, en el correo y en la guardada cifrada.
  const stored = state.updates.find(
    (update) => update.kind === "update" && update.data.cpanelPasswordEncrypted,
  );
  assert.ok(stored, "la contraseña cifrada debe guardarse");
  const password = provision.initialPasswordOrNull(stored.data.cpanelPasswordEncrypted);
  assert.ok(password && password.length === 20);
  assert.ok(customerCall.includes(`<passwd>${password}</passwd>`));
  assert.ok(state.mail[0].text.includes(password));
  assert.ok(state.mail[0].text.includes("Usuario Plesk:"));
  assert.ok(!JSON.stringify(state.updates).includes(password), "nunca en claro en base");
  assert.equal(services["svc_1"].panelAccountId, username);
  assert.equal(services["svc_1"].cpanelUser, null, "cpanelUser es solo de WHM");
  assert.equal(services["svc_1"].status, "active");
  assert.ok(state.events.some((event) => event.action === "service.provisioned"));
});

/* ------------------------------ DirectAdmin ------------------------------ */

test("alta por DirectAdmin con transporte falso: usuario con paquete e IP, sin tocar WHM", async () => {
  const { provision, state, services, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "directadmin" },
    setting: DA_SETTING,
    daFake: daFake(),
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  const username = provision.cpanelUsername("svc_1", "midominio.com");
  assert.equal(result.status, "active");
  assert.equal(result.cpanelUser, username);
  assert.equal(result.credentialsSent, true);
  assert.equal(state.writes.length, 0, "WHM no se toca");
  assert.equal(state.configCalls, 0, "la configuración WHM no se consulta");
  assert.equal(calls.da.length, 1);
  assert.match(calls.da[0].url, /^https:\/\/da\.ejemplo:2222\/CMD_API_ACCOUNT_USER\?json=yes$/);
  const form = new URLSearchParams(calls.da[0].body);
  assert.equal(form.get("action"), "create");
  assert.equal(form.get("username"), username);
  assert.equal(form.get("domain"), "midominio.com");
  assert.equal(form.get("email"), "cliente@example.com");
  assert.equal(form.get("package"), "paquete_da");
  assert.equal(form.get("ip"), "203.0.113.20");
  assert.equal(form.get("notify"), "no");
  const stored = state.updates.find(
    (update) => update.kind === "update" && update.data.cpanelPasswordEncrypted,
  );
  const password = provision.initialPasswordOrNull(stored.data.cpanelPasswordEncrypted);
  assert.ok(password && password.length === 20);
  assert.equal(form.get("passwd"), password);
  assert.equal(form.get("passwd2"), password);
  assert.ok(state.mail[0].text.includes("Usuario DirectAdmin:"));
  assert.equal(services["svc_1"].panelAccountId, username);
  assert.equal(services["svc_1"].cpanelUser, null, "cpanelUser es solo de WHM");
  assert.ok(state.events.some((event) => event.action === "service.provisioned"));
});

/* ------------------------------ fallo + reintento ------------------------------ */

test("si Plesk falla, el servicio vuelve a pendiente con el motivo y el reintento manual lo da de alta", async () => {
  const { provision, state, services, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "plesk" },
    setting: PLESK_SETTING,
    pleskFake: pleskFake({ failFirstWebspace: true }),
  });
  await assert.rejects(
    provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
    (error) => {
      assert.equal(error.name, "ProvisionError");
      assert.equal(error.code, "upstream");
      assert.match(error.message, /Plesk/);
      return true;
    },
  );
  const release = releaseOf(state);
  assert.ok(release, "debe liberar el cerrojo");
  assert.match(release.data.provisionError, /Plesk/);
  assert.match(release.data.provisionError, /1013/);
  assert.ok(state.events.some((event) => event.action === "service.provision_failed"));
  assert.equal(services["svc_1"].status, "pending_provision");
  assert.equal(state.writes.length, 0, "WHM no se toca ni al fallar");
  // El pago sigue confirmado: el reintento manual (la misma acción del admin)
  // lo da de alta, reutilizando el cliente Plesk (errcode 1007).
  const retry = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(retry.status, "active");
  assert.equal(retry.cpanelUser, provision.cpanelUsername("svc_1", "midominio.com"));
  assert.ok(state.events.some((event) => event.action === "service.provisioned"));
  assert.equal(calls.plesk.length, 6, "3 llamadas el intento fallido + 3 el reintento");
});

test("si DirectAdmin falla, el servicio vuelve a pendiente con el motivo y el reintento manual lo da de alta", async () => {
  const { provision, state, services, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "directadmin" },
    setting: DA_SETTING,
    daFake: daFake({ failFirstCreate: true }),
  });
  await assert.rejects(
    provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
    (error) => {
      assert.equal(error.name, "ProvisionError");
      assert.equal(error.code, "upstream");
      assert.match(error.message, /DirectAdmin/);
      return true;
    },
  );
  const release = releaseOf(state);
  assert.ok(release, "debe liberar el cerrojo");
  assert.match(release.data.provisionError, /DirectAdmin/);
  assert.match(release.data.provisionError, /upstream/);
  assert.ok(state.events.some((event) => event.action === "service.provision_failed"));
  assert.equal(services["svc_1"].status, "pending_provision");
  const retry = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(retry.status, "active");
  assert.equal(retry.cpanelUser, provision.cpanelUsername("svc_1", "midominio.com"));
  assert.equal(calls.da.length, 3, "crear fallido + adopción + crear del reintento");
});

/* ------------------------------ WHM sin cambios ------------------------------ */

test("servicio WHM: el camino no cambia (createacct directo, usuario cPanel guardado)", async () => {
  const { provision, state, services, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "whm" },
    setting: { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
    pleskFake: pleskFake(),
    daFake: daFake(),
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.status, "active");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].action, "createacct");
  assert.equal(state.writes[0].params.domain, "midominio.com");
  assert.equal(state.writes[0].params.plan, "basico");
  assert.equal(state.writes[0].params.contactemail, "cliente@example.com");
  assert.ok(state.writes[0].params.password.length >= 20);
  assert.equal(services["svc_1"].cpanelUser, result.cpanelUser);
  assert.equal(services["svc_1"].panelAccountId, result.cpanelUser);
  assert.equal(calls.plesk.length, 0);
  assert.equal(calls.da.length, 0);
  assert.ok(state.configCalls >= 1, "WHM sí lee su configuración");
  assert.ok(state.events.some((event) => event.action === "service.provisioned"));
});

test("un servicio sin panelKey se trata como WHM", async () => {
  const legacy = { ...PAID_SERVICE };
  delete legacy.panelKey;
  const { provision, state } = provisionModule({
    service: legacy,
    setting: { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
    pleskFake: pleskFake(),
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.status, "active");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].action, "createacct");
});

/* ------------------------------ panel "none" y doble cerrojo ------------------------------ */

test("panel «none» o desconocido: fallo explícito sin llamar a ningún panel ni tomar el cerrojo", async () => {
  for (const panelKey of ["none", "cpanelX"]) {
    const { provision, state, calls } = provisionModule({
      service: { ...PAID_SERVICE, panelKey },
      setting: PLESK_SETTING,
      pleskFake: pleskFake(),
      daFake: daFake(),
    });
    await assert.rejects(
      provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
      (error) => {
        assert.equal(error.name, "ProvisionError");
        assert.equal(error.code, "panel");
        return true;
      },
      panelKey,
    );
    assert.equal(state.writes.length, 0, panelKey);
    assert.equal(calls.plesk.length, 0, panelKey);
    assert.equal(calls.da.length, 0, panelKey);
    assert.ok(
      !state.updates.some((update) => update.kind === "updateMany"),
      `sin cerrojo: ${panelKey}`,
    );
  }
});

test("doble cerrojo: sin PLESK_ENABLED o sin plugin activo el alta falla sin llamadas", async () => {
  const noEnv = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "plesk" },
    setting: PLESK_SETTING,
    env: { PLESK_ENABLED: "false" },
    pleskFake: pleskFake(),
  });
  await assert.rejects(
    noEnv.provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
    (error) => error.name === "ProvisionError" && error.code === "upstream",
  );
  assert.equal(noEnv.calls.plesk.length, 0);
  const releasePlesk = releaseOf(noEnv.state);
  assert.ok(releasePlesk, "debe liberar el cerrojo");
  assert.match(releasePlesk.data.provisionError, /Plesk no está configurado/);
  assert.match(releasePlesk.data.provisionError, /PLESK_ENABLED/);
  assert.ok(
    noEnv.state.events.some((event) => event.action === "service.provision_failed"),
  );

  const noPlugin = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "directadmin" },
    setting: DA_SETTING,
    plugin: { enabled: { directadmin: false } },
    daFake: daFake(),
  });
  await assert.rejects(
    noPlugin.provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
    (error) => error.name === "ProvisionError" && error.code === "upstream",
  );
  assert.equal(noPlugin.calls.da.length, 0);
  const releaseDa = releaseOf(noPlugin.state);
  assert.ok(releaseDa, "debe liberar el cerrojo");
  assert.match(releaseDa.data.provisionError, /DirectAdmin no está configurado/);
});

test("en Plesk/DirectAdmin solo vale el paquete por plan: el paquete WHM por defecto no se reutiliza", async () => {
  for (const panelKey of ["plesk", "directadmin"]) {
    const { provision, state, calls } = provisionModule({
      service: { ...PAID_SERVICE, panelKey },
      setting: { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
      pleskFake: pleskFake(),
      daFake: daFake(),
    });
    await assert.rejects(
      provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
      (error) => {
        assert.equal(error.name, "ProvisionError");
        assert.equal(error.code, "package");
        return true;
      },
      panelKey,
    );
    assert.equal(calls.plesk.length, 0, panelKey);
    assert.equal(calls.da.length, 0, panelKey);
    assert.equal(state.writes.length, 0, panelKey);
  }
});

/* ------------------------------ maybeAutoProvision ------------------------------ */

test("maybeAutoProvision en Plesk no exige WHM: sin fila WHM, el alta se intenta", async () => {
  const { provision, state } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "plesk" },
    setting: PLESK_SETTING,
    credentials: null,
    invoice: { order: { service: { id: "svc_1", panelKey: "plesk", planId: "plan-basico" } } },
    pleskFake: pleskFake(),
  });
  const result = await provision.maybeAutoProvision({ invoiceId: "inv_1", actor: "paypal" });
  assert.equal(result.attempted, true);
  assert.equal(result.provisioned, true);
  assert.equal(state.configCalls, 0, "WHM no se consulta");
});

test("maybeAutoProvision en Plesk sin paquete salta con motivo y sin llamar al panel", async () => {
  const { provision, state, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "plesk" },
    setting: { enabled: true, packageName: "basico", packageByPlan: {}, panelByPlan: {} },
    invoice: { order: { service: { id: "svc_1", panelKey: "plesk", planId: "plan-basico" } } },
    pleskFake: pleskFake(),
  });
  const result = await provision.maybeAutoProvision({ invoiceId: "inv_1", actor: "paypal" });
  assert.equal(result.attempted, false);
  assert.equal(result.provisioned, false);
  assert.match(result.reason, /sin paquete\/plan/);
  assert.equal(calls.plesk.length, 0);
  assert.ok(state.events.some((event) => event.action === "service.provision_skipped"));
});

test("maybeAutoProvision con panel «none» salta con motivo y sin llamar a nada", async () => {
  const { provision, state, calls } = provisionModule({
    service: { ...PAID_SERVICE, panelKey: "none" },
    setting: PLESK_SETTING,
    invoice: { order: { service: { id: "svc_1", panelKey: "none", planId: "plan-basico" } } },
    pleskFake: pleskFake(),
    daFake: daFake(),
  });
  const result = await provision.maybeAutoProvision({ invoiceId: "inv_1", actor: "paypal" });
  assert.equal(result.attempted, false);
  assert.equal(result.provisioned, false);
  assert.match(result.reason, /no tiene panel/);
  assert.equal(calls.plesk.length, 0);
  assert.equal(calls.da.length, 0);
  assert.equal(state.writes.length, 0);
  assert.ok(state.events.some((event) => event.action === "service.provision_skipped"));
});
