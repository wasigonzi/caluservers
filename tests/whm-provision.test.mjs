// Alta automática en WHM. Servidor, usuario, token y dominios son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { loader } from "./helpers/load.mjs";

const HOST = "https://whm.example.net:2087";
const TOKEN = "TEST_ONLY_WRITE_TOKEN_CANARY_987654321";

/* ------------------------------ el transporte ------------------------------ */

function transportMock({ status = 200, body, raw, fail = false, stall = false } = {}) {
  const calls = [];
  return {
    calls,
    module: {
      request(url, options, handler) {
        const req = new EventEmitter();
        req.destroy = () => req.emit("close");
        req.write = (payload) => {
          calls.push({ url: String(url), options, payload: payload.toString("utf8") });
        };
        req.end = () => {
          if (fail) {
            setImmediate(() => req.emit("error", new Error("red")));
            return;
          }
          if (stall) return;
          const res = new EventEmitter();
          res.statusCode = status;
          res.destroy = () => {};
          setImmediate(() => {
            handler(res);
            res.emit(
              "data",
              Buffer.from(
                raw ??
                  JSON.stringify(
                    body ?? {
                      metadata: { result: 1, command: "createacct", version: 1, reason: "ok" },
                      data: { options: { username: "miti1a2b" } },
                    },
                  ),
                "utf8",
              ),
            );
            res.emit("end");
          });
        };
        return req;
      },
    },
  };
}

function writeModule(mocks = {}) {
  const https = transportMock(mocks.https);
  const h = loader({
    "node:https": https.module,
    "node:dns/promises": {
      lookup: async () => mocks.dns ?? [{ address: "8.8.8.8", family: 4 }],
    },
    setTimeout: mocks.setTimeout,
  });
  return { write: h.load("lib/whm-write.ts"), https };
}

test("el transporte de escritura solo admite createacct y no sale a la red con otro comando", async () => {
  const { write, https } = writeModule();
  for (const action of [
    "listaccts",
    "suspendacct",
    "passwd",
    "removeacct",
    "__proto__",
    "createacct?x=1",
    "",
  ]) {
    await assert.rejects(
      write.writeWhm(HOST, { username: "root", token: TOKEN }, action, {}),
      (error) => error.name === "WhmError" && error.code === "invalid",
      action,
    );
  }
  assert.equal(https.calls.length, 0);
});

test("la lectura sigue rechazando createacct: el permiso no se mezcla", async () => {
  const h = loader({
    "node:https": {
      request: () => {
        throw new Error("la lectura no debía salir a la red");
      },
    },
  });
  const transport = h.load("lib/whm-transport.ts");
  await assert.rejects(
    transport.readWhm(HOST, { username: "root", token: TOKEN }, "createacct"),
    (error) => error.code === "invalid",
  );
  const security = h.load("lib/whm-security.ts");
  assert.equal(security.WHM_ACTIONS.join(","), "listaccts,listpkgs");
});

test("un parámetro con salto de línea o nombre raro no llega al servidor", async () => {
  const { write, https } = writeModule();
  for (const params of [
    { domain: "midominio.com\r\nX-Evil: 1" },
    { "domain;x": "midominio.com" },
    { domain: "x".repeat(400) },
    { domain: "midominio.com\u0000" },
  ]) {
    await assert.rejects(
      write.writeWhm(HOST, { username: "root", token: TOKEN }, "createacct", params),
      (error) => error.code === "invalid",
    );
  }
  assert.equal(https.calls.length, 0);
});

test("la petición es POST con formulario, api.version=1 y TLS verificado", async () => {
  const { write, https } = writeModule();
  await write.writeWhm(HOST, { username: "root", token: TOKEN }, "createacct", {
    username: "miti1a2b",
    domain: "midominio.com",
    plan: "basico",
    password: "secreta-de-prueba",
  });
  const call = https.calls[0];
  assert.equal(call.url, "https://whm.example.net:2087/json-api/createacct");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.rejectUnauthorized, true);
  assert.equal(call.options.headers.Authorization, `whm root:${TOKEN}`);
  const form = new URLSearchParams(call.payload);
  assert.equal(form.get("api.version"), "1");
  assert.equal(form.get("domain"), "midominio.com");
  assert.equal(form.get("plan"), "basico");
});

test("metadata incorrecta, 401, red caída o cuerpo ilegible nunca son un alta", async () => {
  for (const [https, code] of [
    [{ body: { metadata: { result: 0, command: "createacct", version: 1 } } }, "rejected"],
    [{ body: { metadata: { result: 1, command: "listaccts", version: 1 } } }, "response"],
    [{ body: { metadata: { result: 1, command: "createacct", version: 2 } } }, "response"],
    [{ body: {} }, "response"],
    [{ raw: "no es json" }, "response"],
    [{ status: 401 }, "rejected"],
    [{ status: 302 }, "network"],
    [{ fail: true }, "network"],
  ]) {
    const { write } = writeModule({ https });
    await assert.rejects(
      write.writeWhm(HOST, { username: "root", token: TOKEN }, "createacct", {
        domain: "midominio.com",
      }),
      (error) => error.code === code,
      JSON.stringify(https),
    );
  }
});

test("el token nunca aparece en el mensaje devuelto por el servidor", () => {
  const { write } = writeModule();
  const parsed = write.parseWriteResponse(
    {
      metadata: {
        result: 1,
        command: "createacct",
        version: 1,
        reason: `cuenta creada con ${TOKEN}\nsegunda línea`,
      },
      data: { options: { username: "miti1a2b" } },
    },
    "createacct",
    TOKEN,
  );
  assert.ok(!parsed.statusmsg.includes(TOKEN));
  assert.ok(parsed.statusmsg.includes("[oculto]"));
  assert.ok(!/[\r\n]/.test(parsed.statusmsg));
  assert.equal(parsed.user, "miti1a2b");
});

test("un DNS privado bloquea la escritura", async () => {
  const { write, https } = writeModule({ dns: [{ address: "10.0.0.5", family: 4 }] });
  await assert.rejects(
    write.writeWhm(HOST, { username: "root", token: TOKEN }, "createacct", {
      domain: "midominio.com",
    }),
    (error) => error.code === "blocked",
  );
  assert.equal(https.calls.length, 0);
});

/* ------------------------------ la provisión ------------------------------ */

function provisionModule(mocks = {}) {
  const state = {
    services: mocks.service ? { [mocks.service.id]: { ...mocks.service } } : {},
    updates: [],
    events: [],
    mail: [],
    writes: [],
    reads: [],
    listaccts: mocks.listaccts ?? null,
    updateManyResult: mocks.updateManyResult ?? 1,
  };
  const db = {
    customerService: {
      findUnique: async () => (mocks.service ? { ...mocks.service } : null),
      updateMany: async (args) => {
        state.updates.push({ kind: "updateMany", ...args });
        return { count: state.updateManyResult };
      },
      update: async (args) => {
        state.updates.push({ kind: "update", ...args });
        return { id: args.where.id, ...args.data };
      },
    },
    integrationConfig: {
      findUnique: async () =>
        mocks.credentials === null
          ? null
          : { id: "whm-provision", endpoint: HOST, encryptedCredentials: "sealed" },
    },
    provisionSetting: {
      findUnique: async () => mocks.setting ?? null,
      upsert: async (args) => args,
    },
    user: {
      findUnique: async () => mocks.customer ?? { email: "cliente@example.com", name: "Ana" },
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
      sealSecret: () => "sealed",
      openSecret: () => JSON.stringify({ username: "root", token: TOKEN }),
      SecretBoxError: class SecretBoxError extends Error {},
    },
    "@/lib/whm-write": {
      writeWhm: async (endpoint, credentials, action, params) => {
        state.writes.push({ endpoint, action, params });
        // El error es un WhmError real del mismo realm: así se prueba el mapeo de código.
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
    env: mocks.env,
  });
  const provision = h.load("lib/whm-provision.ts");
  whmError = h.load("lib/whm-security.ts").WhmError;
  return { provision, state };
}

const PAID_SERVICE = {
  id: "svc_1",
  userId: "user_1",
  planId: "plan-basico",
  planName: "Hosting Básico",
  status: "pending_provision",
  cpanelUser: null,
  order: {
    domain: "midominio.com",
    invoice: { payment: { status: "confirmed" } },
  },
};

test("el usuario cPanel es determinista, de 8 caracteres y empieza por letra", () => {
  const { provision } = provisionModule();
  const first = provision.cpanelUsername("svc_1", "midominio.com");
  assert.equal(first, provision.cpanelUsername("svc_1", "midominio.com"));
  assert.notEqual(first, provision.cpanelUsername("svc_2", "midominio.com"));
  for (const [id, domain] of [
    ["svc_1", "midominio.com"],
    ["svc_2", "9999.com"],
    ["svc_3", "root.com"],
    ["svc_4", "a.com"],
  ]) {
    const user = provision.cpanelUsername(id, domain);
    assert.match(user, /^[a-z][a-z0-9]{0,7}$/);
    assert.ok(user.length <= 8);
    assert.ok(!["root", "admin", "cpanel", "test"].includes(user));
  }
});

test("la contraseña inicial es determinista por servicio, con las 4 clases y sin el usuario", () => {
  const { provision } = provisionModule();
  const first = provision.initialPassword("svc_1", "miti1a2b");
  assert.equal(first, provision.initialPassword("svc_1", "miti1a2b"));
  assert.notEqual(first, provision.initialPassword("svc_2", "miti1a2b"));
  assert.notEqual(first, provision.initialPassword("svc_1", "otro1a2b"));
  for (const [serviceId, username] of [
    ["svc_1", "miti1a2b"],
    ["svc_2", "abc12345"],
    ["svc_3", "x9y8z7w6"],
  ]) {
    const password = provision.initialPassword(serviceId, username);
    assert.equal(password.length, 20);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[!@#%^*\-_=+]/);
    assert.ok(!password.toLowerCase().includes(username.toLowerCase()));
  }
});

test("el paquete por plan gana al paquete por defecto", () => {
  const { provision } = provisionModule();
  const config = { packageName: "general", packageByPlan: { "plan-pro": "pro" } };
  assert.equal(provision.packageFor(config, "plan-pro"), "pro");
  assert.equal(provision.packageFor(config, "plan-basico"), "general");
});

test("el mapa de paquetes descarta claves y nombres no válidos", () => {
  const { provision } = provisionModule();
  const parsed = provision.parsePackageMap({
    "plan-ok": "paquete_1",
    "plan malo": "x",
    "plan-2": "nombre con <html>",
    "plan-3": "",
    "plan-4": 42,
    "plan-5": "ok-2",
  });
  assert.equal(parsed["plan-ok"], "paquete_1");
  assert.equal(parsed["plan-5"], "ok-2");
  assert.equal(Object.keys(parsed).length, 2);
});

test("el estado solo es «listo» con activación, token, paquete y correo", async () => {
  const cases = [
    [{ setting: { enabled: true, packageName: "basico" }, mailReady: true }, true],
    [{ setting: { enabled: false, packageName: "basico" }, mailReady: true }, false],
    [{ setting: { enabled: true, packageName: "" }, mailReady: true }, false],
    [{ setting: { enabled: true, packageName: "basico" }, mailReady: false }, false],
    [{ setting: { enabled: true, packageName: "basico" }, credentials: null, mailReady: true }, false],
  ];
  for (const [mocks, expected] of cases) {
    const { provision } = provisionModule(mocks);
    const config = await provision.provisionConfiguration();
    assert.equal(config.ready, expected, JSON.stringify(mocks));
  }
});

test("no se da de alta sin pago, sin dominio, desactivado o sin correo", async () => {
  const base = { setting: { enabled: true, packageName: "basico" }, mailReady: true };
  const cases = [
    [{ ...base, service: null }, "notfound"],
    [
      {
        ...base,
        service: { ...PAID_SERVICE, order: { ...PAID_SERVICE.order, invoice: { payment: null } } },
      },
      "unpaid",
    ],
    [{ ...base, service: { ...PAID_SERVICE, status: "active" } }, "state"],
    [{ ...base, service: { ...PAID_SERVICE, order: { ...PAID_SERVICE.order, domain: null } } }, "domain"],
    [{ ...base, service: PAID_SERVICE, setting: { enabled: false, packageName: "basico" } }, "disabled"],
    [{ ...base, service: PAID_SERVICE, mailReady: false }, "mail"],
    [{ ...base, service: PAID_SERVICE, setting: { enabled: true, packageName: "" } }, "package"],
  ];
  for (const [mocks, code] of cases) {
    const { provision, state } = provisionModule(mocks);
    await assert.rejects(
      provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
      (error) => error.name === "ProvisionError" && error.code === code,
      code,
    );
    assert.equal(state.writes.length, 0, `no debía llamar a WHM: ${code}`);
  }
});

test("un alta correcta guarda el usuario, envía la contraseña y no la almacena", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.status, "active");
  assert.equal(result.credentialsSent, true);
  assert.match(result.cpanelUser, /^[a-z][a-z0-9]{0,7}$/);

  const sent = state.writes[0];
  assert.equal(sent.action, "createacct");
  assert.equal(sent.params.domain, "midominio.com");
  assert.equal(sent.params.plan, "basico");
  assert.equal(sent.params.contactemail, "cliente@example.com");
  assert.ok(sent.params.password.length >= 20);

  // La contraseña va al correo del cliente y a ninguna escritura de base.
  assert.ok(state.mail[0].text.includes(sent.params.password));
  const written = JSON.stringify(state.updates);
  assert.ok(!written.includes(sent.params.password), "la contraseña no se guarda");
  assert.ok(state.events.some((event) => event.action === "service.provisioned"));
});

test("el cerrojo impide dos altas para el mismo servicio", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    updateManyResult: 0,
  });
  await assert.rejects(
    provision.provisionService({ serviceId: "svc_1", actor: "admin" }),
    (error) => error.code === "state",
  );
  assert.equal(state.writes.length, 0);
});

test("un servicio que ya tiene cuenta no se vuelve a crear", async () => {
  const { provision, state } = provisionModule({
    service: { ...PAID_SERVICE, cpanelUser: "miti1a2b", status: "active" },
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.cpanelUser, "miti1a2b");
  assert.equal(state.writes.length, 0);
});

test("si WHM falla, el servicio vuelve a pendiente con un motivo saneado", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    writeThrowsCode: "rejected",
  });
  await assert.rejects(provision.provisionService({ serviceId: "svc_1", actor: "admin" }));
  const release = state.updates.find(
    (update) => update.kind === "update" && update.data.status === "pending_provision",
  );
  assert.ok(release, "debe liberar el cerrojo");
  assert.match(release.data.provisionError, /rejected/);
  assert.ok(!release.data.provisionError.includes(TOKEN));
  assert.ok(state.events.some((event) => event.action === "service.provision_failed"));
});

test("si la respuesta se pierde pero WHM creó la cuenta, el reintento la adopta sin duplicarla", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    writeThrowsCode: "timeout",
  });
  const username = provision.cpanelUsername("svc_1", "midominio.com");
  state.listaccts = {
    rows: [{ user: username, domain: "midominio.com", plan: "basico" }],
    total: 1,
    truncated: false,
  };
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.status, "active");
  assert.equal(result.cpanelUser, username);
  assert.equal(result.credentialsSent, true);
  // Solo el intento fallido: no se llamó a createacct una segunda vez.
  assert.equal(state.writes.length, 1);
  assert.ok(state.reads.length >= 1, "debió comprobar la lista de cuentas");
  // La contraseña enviada es la determinista: es la que tiene la cuenta adoptada.
  const password = provision.initialPassword("svc_1", username);
  assert.ok(state.mail[0].text.includes(password));
  assert.ok(state.mail[0].text.includes(username));
  assert.ok(
    state.events.some(
      (event) =>
        event.action === "service.provisioned" && event.details.includes("adopted=1"),
    ),
  );
  assert.ok(!state.events.some((event) => event.action === "service.provision_failed"));
});

test("una cuenta con otro dominio no se adopta: el fallo queda visible", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    writeThrowsCode: "rejected",
  });
  const username = provision.cpanelUsername("svc_1", "midominio.com");
  state.listaccts = {
    rows: [{ user: username, domain: "otro-cliente.com", plan: "basico" }],
    total: 1,
    truncated: false,
  };
  await assert.rejects(provision.provisionService({ serviceId: "svc_1", actor: "admin" }));
  const release = state.updates.find(
    (update) => update.kind === "update" && update.data.status === "pending_provision",
  );
  assert.ok(release, "debe liberar el cerrojo");
  assert.ok(state.events.some((event) => event.action === "service.provision_failed"));
});

test("sin lectura de WHM no se puede adoptar y el fallo queda visible", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    writeThrowsCode: "network",
    readThrows: true,
  });
  await assert.rejects(provision.provisionService({ serviceId: "svc_1", actor: "admin" }));
  const release = state.updates.find(
    (update) => update.kind === "update" && update.data.status === "pending_provision",
  );
  assert.ok(release, "debe liberar el cerrojo");
  assert.ok(state.events.some((event) => event.action === "service.provision_failed"));
});

test("si la cuenta se crea pero el correo no sale, queda constancia", async () => {
  const { provision, state } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    mailDelivered: false,
  });
  const result = await provision.provisionService({ serviceId: "svc_1", actor: "admin" });
  assert.equal(result.credentialsSent, false);
  const flagged = state.updates.find(
    (update) => update.kind === "update" && update.data.provisionError,
  );
  assert.match(flagged.data.provisionError, /contraseña/i);
});

test("el alta automática no se intenta cuando la configuración no está lista", async () => {
  const { provision, state } = provisionModule({
    setting: { enabled: false, packageName: "" },
    mailReady: false,
  });
  const result = await provision.maybeAutoProvision({ invoiceId: "inv_1", actor: "admin" });
  assert.equal(result.attempted, false);
  assert.equal(result.provisioned, false);
  assert.equal(state.writes.length, 0);
});

test("un fallo del alta automática no rompe el cobro", async () => {
  const { provision } = provisionModule({
    service: PAID_SERVICE,
    setting: { enabled: true, packageName: "basico" },
    mailReady: true,
    invoice: { order: { service: { id: "svc_1" } } },
    writeThrowsCode: "timeout",
  });
  const result = await provision.maybeAutoProvision({ invoiceId: "inv_1", actor: "paypal" });
  assert.equal(result.attempted, true);
  assert.equal(result.provisioned, false);
  assert.ok(result.reason);
});
