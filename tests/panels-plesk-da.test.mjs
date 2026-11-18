// Plesk y DirectAdmin: adaptadores de panel (Fase 4, frente B).
// Sin red real: transporte falso inyectado. Todos los hosts, credenciales
// y respuestas son señuelos locales; ningún servidor Plesk ni DirectAdmin
// se toca. Las respuestas XML y url-encoded son FIXTURES INVENTADAS para
// probar el parseo, no respuestas reales de ningún servidor.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

class OutboundError extends Error {
  constructor(code) {
    super(`outbound:${code}`);
    this.name = "OutboundError";
    this.code = code;
  }
}


/**
 * Igualdad estructural por JSON: los objetos que salen del módulo cargado
 * viven en otro reino del VM y `deepStrictEqual` los rechaza por prototipo.
 */
function same(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

/* ------------------------------ Plesk ------------------------------ */

const PLESK_OK = (inner) =>
  ({
    status: 200,
    text: `<?xml version="1.0" encoding="UTF-8"?><packet version="1.6.7.0">${inner}</packet>`,
  });

const PLESK_PLANS = PLESK_OK(
  `<service-plan><get>` +
    `<result><status>ok</status><id>11</id><name>base_plan</name><guid>dea4315c-a1da-2ea7-4142-ddc42d0902f9</guid></result>` +
    `<result><status>ok</status><id>12</id><name>pro_plan</name><guid>cc982f71-48c3-479d-bc7b-59b97547e092</guid></result>` +
    `</get></service-plan>`,
);

function loadPlesk({ fake, plugin = {}, env = {} } = {}) {
  const calls = [];
  const transport = async (options) => {
    calls.push({ ...options });
    if (typeof fake === "function") return fake(options, calls);
    throw new Error("transporte no configurado en la prueba");
  };
  const h = loader({
    "./plugins": {
      isPluginEnabled: async () => plugin.enabled ?? true,
      getPluginSecrets: async () =>
        plugin.secrets === undefined
          ? { login: "admin", password: "secreto-falso" }
          : plugin.secrets,
      getPluginConfig: async () =>
        plugin.config ?? { url: "https://plesk.ejemplo:8443", mode: "login", ipAddress: "203.0.113.10" },
    },
    "./outbound": {
      OutboundError,
      requestText: async () => {
        throw new Error("red real no permitida en la prueba");
      },
    },
    env: { PLESK_ENABLED: "true", ...env },
  });
  const mod = h.load("lib/plesk.ts");
  mod.__setPleskFetch(transport);
  return { mod, calls };
}

test("plesk: sin PLESK_ENABLED, sin plugin activo o sin secretos → unconfigured 503, sin llamadas", async () => {
  const noEnv = loadPlesk({ env: { PLESK_ENABLED: "false" } });
  await assert.rejects(() => noEnv.mod.pleskPanel.listPackages(), (error) => {
    assert.equal(error.code, "unconfigured");
    assert.equal(error.httpStatus, 503);
    return true;
  });
  assert.equal(noEnv.calls.length, 0);

  const disabled = loadPlesk({ plugin: { enabled: false } });
  await assert.rejects(() => disabled.mod.pleskPanel.listPackages(), (error) => error.code === "unconfigured");
  assert.equal(disabled.calls.length, 0);

  const noSecrets = loadPlesk({ plugin: { secrets: null } });
  await assert.rejects(() => noSecrets.mod.pleskPanel.listPackages(), (error) => error.code === "unconfigured");
  assert.equal(noSecrets.calls.length, 0);
});

test("plesk listPackages: parsea planes y llama a agent.php con XML y auth login", async () => {
  const { mod, calls } = loadPlesk({ fake: () => PLESK_PLANS });
  const packages = await mod.pleskPanel.listPackages();
  same(
    packages.map((item) => item.name),
    ["base_plan", "pro_plan"],
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/plesk\.ejemplo:8443\/enterprise\/control\/agent\.php$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].contentType, "text/xml");
  same(calls[0].allowHosts, ["plesk.ejemplo"]);
  assert.equal(calls[0].headers["HTTP_AUTH_LOGIN"], "admin");
  assert.equal(calls[0].headers["HTTP_AUTH_PASSWD"], "secreto-falso");
  assert.equal(calls[0].headers.KEY, undefined);
  assert.match(calls[0].body, /<service-plan><get><filter\/><owner-all\/><\/get><\/service-plan>/);
});

test("plesk modo secret-key: usa la cabecera KEY y no login/contraseña", async () => {
  const { mod, calls } = loadPlesk({
    plugin: {
      config: { url: "https://plesk.ejemplo:8443", mode: "secret-key", ipAddress: "203.0.113.10" },
      secrets: { secretKey: "clave-falsa" },
    },
    fake: () => PLESK_PLANS,
  });
  const packages = await mod.pleskPanel.listPackages();
  assert.equal(packages.length, 2);
  assert.equal(calls[0].headers.KEY, "clave-falsa");
  assert.equal(calls[0].headers["HTTP_AUTH_LOGIN"], undefined);
  assert.equal(calls[0].headers["HTTP_AUTH_PASSWD"], undefined);
});

test("plesk modo secret-key sin clave guardada → unconfigured", async () => {
  const { mod, calls } = loadPlesk({
    plugin: {
      config: { url: "https://plesk.ejemplo:8443", mode: "secret-key" },
      secrets: { login: "admin", password: "secreto-falso" },
    },
  });
  await assert.rejects(() => mod.pleskPanel.listPackages(), (error) => error.code === "unconfigured");
  assert.equal(calls.length, 0);
});

test("plesk createAccount: cliente nuevo + suscripción con plan e IP", async () => {
  const { mod, calls } = loadPlesk({
    fake: ({ body }) => {
      if (body.includes("<customer><add>")) {
        return PLESK_OK(
          `<customer><add><result><status>ok</status><id>42</id><guid>d7914f79-d089-4db1-b506-4fac617ebd60</guid></result></add></customer>`,
        );
      }
      if (body.includes("<webspace><add>")) {
        return PLESK_OK(
          `<webspace><add><result><status>ok</status><id>4</id><guid>5ff343c1-a40b-4305-8986-2f27c240db7e</guid></result></add></webspace>`,
        );
      }
      throw new Error(`llamada inesperada: ${body.slice(0, 80)}`);
    },
  });
  const result = await mod.pleskPanel.createAccount({
    domain: "midominio.com",
    username: "cliente1",
    password: "clave-falsa",
    plan: "base_plan",
    email: "cliente@example.com",
  });
  same(result, { username: "cliente1", domain: "midominio.com" });
  assert.equal(calls.length, 2);
  const customerCall = calls[0].body;
  assert.match(customerCall, /<login>cliente1<\/login>/);
  assert.match(customerCall, /<passwd>clave-falsa<\/passwd>/);
  assert.match(customerCall, /<email>cliente@example\.com<\/email>/);
  const webspaceCall = calls[1].body;
  assert.match(webspaceCall, /<name>midominio\.com<\/name>/);
  assert.match(webspaceCall, /<owner-id>42<\/owner-id>/);
  assert.match(webspaceCall, /<htype>vrt_hst<\/htype>/);
  assert.match(webspaceCall, /<ip_address>203\.0\.113\.10<\/ip_address>/);
  assert.match(webspaceCall, /<plan-name>base_plan<\/plan-name>/);
  assert.match(webspaceCall, /<name>ftp_login<\/name><value>cliente1<\/value>/);
});

test("plesk createAccount: sin IP configurada falla antes de llamar", async () => {
  const { mod, calls } = loadPlesk({
    plugin: { config: { url: "https://plesk.ejemplo:8443", mode: "login", ipAddress: "" } },
  });
  await assert.rejects(
    () =>
      mod.pleskPanel.createAccount({
        domain: "midominio.com",
        username: "cliente1",
        password: "clave-falsa",
        plan: "base_plan",
        email: "cliente@example.com",
      }),
    (error) => error.code === "invalid",
  );
  assert.equal(calls.length, 0);
});

test("plesk createAccount: login duplicado (1007) reutiliza el cliente", async () => {
  const { mod, calls } = loadPlesk({
    fake: ({ body }) => {
      if (body.includes("<customer><add>")) {
        return PLESK_OK(
          `<customer><add><result><status>error</status><errcode>1007</errcode><errtext>login duplicado</errtext></result></add></customer>`,
        );
      }
      if (body.includes("<customer><get>")) {
        return PLESK_OK(
          `<customer><get><result><status>ok</status><filter-id>cliente1</filter-id><id>42</id>` +
            `<data><gen_info><login>cliente1</login><status>0</status></gen_info></data></result></get></customer>`,
        );
      }
      if (body.includes("<webspace><add>")) {
        return PLESK_OK(
          `<webspace><add><result><status>ok</status><id>4</id></result></add></webspace>`,
        );
      }
      throw new Error(`llamada inesperada: ${body.slice(0, 80)}`);
    },
  });
  const result = await mod.pleskPanel.createAccount({
    domain: "otro.com",
    username: "cliente1",
    password: "clave-falsa",
    plan: "base_plan",
    email: "cliente@example.com",
  });
  same(result, { username: "cliente1", domain: "otro.com" });
  assert.equal(calls.length, 3);
  assert.match(calls[2].body, /<owner-id>42<\/owner-id>/);
});

test("plesk suspend/unsuspend: webspace SET con status 16 y 0 sobre owner-login", async () => {
  const { mod, calls } = loadPlesk({
    fake: () =>
      PLESK_OK(
        `<webspace><set><result><status>ok</status><filter-id>cliente1</filter-id><id>4</id></result></set></webspace>`,
      ),
  });
  await mod.pleskPanel.suspendAccount({ username: "cliente1" });
  assert.match(calls[0].body, /<filter><owner-login>cliente1<\/owner-login><\/filter>/);
  assert.match(calls[0].body, /<gen_setup><status>16<\/status><\/gen_setup>/);
  await mod.pleskPanel.unsuspendAccount({ username: "cliente1" });
  assert.match(calls[1].body, /<gen_setup><status>0<\/status><\/gen_setup>/);
  assert.equal(calls.length, 2);
});

test("plesk terminate: customer DEL por login", async () => {
  const { mod, calls } = loadPlesk({
    fake: () =>
      PLESK_OK(
        `<customer><del><result><status>ok</status><id>42</id></result></del></customer>`,
      ),
  });
  await mod.pleskPanel.terminateAccount({ username: "cliente1" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].body, /<customer><del><filter><login>cliente1<\/login><\/filter><\/del><\/customer>/);
});

test("plesk changePackage: resuelve el GUID del plan y cambia todas las suscripciones", async () => {
  const { mod, calls } = loadPlesk({
    fake: ({ body }) => {
      if (body.includes("<service-plan><get>")) {
        assert.match(body, /<filter><name>pro_plan<\/name><\/filter>/);
        return PLESK_OK(
          `<service-plan><get><result><status>ok</status><id>12</id><name>pro_plan</name><guid>cc982f71-48c3-479d-bc7b-59b97547e092</guid></result></get></service-plan>`,
        );
      }
      if (body.includes("<webspace><get>")) {
        return PLESK_OK(
          `<webspace><get>` +
            `<result><status>ok</status><id>5</id></result>` +
            `<result><status>ok</status><id>6</id></result>` +
            `</get></webspace>`,
        );
      }
      if (body.includes("<switch-subscription>")) {
        assert.match(body, /<plan-guid>cc982f71-48c3-479d-bc7b-59b97547e092<\/plan-guid>/);
        return PLESK_OK(
          `<webspace><switch-subscription><result><status>ok</status><filter-id>5</filter-id><id>5</id></result></switch-subscription></webspace>`,
        );
      }
      throw new Error(`llamada inesperada: ${body.slice(0, 80)}`);
    },
  });
  await mod.pleskPanel.changePackage({ username: "cliente1", plan: "pro_plan" });
  assert.equal(calls.length, 4);
  assert.match(calls[2].body, /<filter><id>5<\/id><\/filter>/);
  assert.match(calls[3].body, /<filter><id>6<\/id><\/filter>/);
});

test("plesk listAccounts: dominio, propietario y suspendido por status", async () => {
  const { mod } = loadPlesk({
    fake: () =>
      PLESK_OK(
        `<webspace><get>` +
          `<result><status>ok</status><id>1</id><data><gen_info><name>ana.com</name><status>0</status><owner-id>10</owner-id><owner-login>ana</owner-login></gen_info></data></result>` +
          `<result><status>ok</status><id>2</id><data><gen_info><name>bob.com</name><status>16</status><owner-id>11</owner-id><owner-login>bob</owner-login></gen_info></data></result>` +
          `<result><status>error</status><errcode>1013</errcode></result>` +
          `</get></webspace>`,
      ),
  });
  const accounts = await mod.pleskPanel.listAccounts();
  same(accounts, [
    { username: "ana", domain: "ana.com", suspended: false },
    { username: "bob", domain: "bob.com", suspended: true },
  ]);
});

test("plesk error: solo el errcode numérico, nunca el errtext crudo", async () => {
  const { mod } = loadPlesk({
    fake: () =>
      PLESK_OK(
        `<customer><add><result><status>error</status><errcode>1013</errcode><errtext>texto interno que no debe salir</errtext></result></add></customer>`,
      ),
  });
  await assert.rejects(
    () =>
      mod.pleskPanel.createAccount({
        domain: "midominio.com",
        username: "cliente1",
        password: "clave-falsa",
        plan: "base_plan",
        email: "cliente@example.com",
      }),
    (error) => {
      assert.equal(error.code, "upstream");
      assert.match(error.message, /1013/);
      assert.doesNotMatch(error.message, /texto interno/);
      return true;
    },
  );
});

test("plesk URL no https o con ruta se rechaza antes de llamar", async () => {
  const http = loadPlesk({
    plugin: { config: { url: "http://plesk.ejemplo:8443", mode: "login" } },
  });
  await assert.rejects(() => http.mod.pleskPanel.listPackages(), (error) => error.code === "invalid");
  assert.equal(http.calls.length, 0);

  const withPath = loadPlesk({
    plugin: { config: { url: "https://plesk.ejemplo:8443/otra", mode: "login" } },
  });
  await assert.rejects(() => withPath.mod.pleskPanel.listPackages(), (error) => error.code === "invalid");
  assert.equal(withPath.calls.length, 0);
});

test("parsePleskPacket: entidades, CDATA, etiquetas vacías y atributos ignorados", () => {
  const { mod } = loadPlesk();
  const root = mod.parsePleskPacket(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<packet version="1.6.7.0"><customer><get><result><status>ok</status>` +
      `<data><gen_info><cname>Tom &amp; Jerry</cname><external-id/>` +
      `<note><![CDATA[a <b> c]]></note></gen_info></data>` +
      `</result></get></customer></packet>`,
  );
  assert.equal(root.tag, "packet");
  const find = (node, tag) => node.children.find((entry) => entry.tag === tag);
  const genInfo = find(find(find(find(find(root, "customer"), "get"), "result"), "data"), "gen_info");
  assert.equal(genInfo.tag, "gen_info");
  const cname = genInfo.children.find((entry) => entry.tag === "cname");
  assert.equal(cname.text, "Tom & Jerry");
  const externalId = genInfo.children.find((entry) => entry.tag === "external-id");
  assert.equal(externalId.text, "");
  const note = genInfo.children.find((entry) => entry.tag === "note");
  assert.equal(note.text, "a <b> c");
});

test("parsePleskPacket: XML mal formado lanza upstream", () => {
  const { mod } = loadPlesk();
  assert.throws(() => mod.parsePleskPacket("<packet><customer>"), (error) => error.code === "upstream");
  assert.throws(
    () => mod.parsePleskPacket("<packet><a></b></packet>"),
    (error) => error.code === "upstream",
  );
});

test("plesk escapeXml: escapa lo que va en los paquetes", () => {
  const { mod } = loadPlesk();
  assert.equal(mod.escapeXml(`a & <b> "c" 'd'`), "a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos;");
});

/* ------------------------------ DirectAdmin ------------------------------ */

function loadDA({ fake, plugin = {}, env = {} } = {}) {
  const calls = [];
  const transport = async (options) => {
    calls.push({
      ...options,
      bodyParams: options.body ? Object.fromEntries(new URLSearchParams(options.body)) : undefined,
    });
    if (typeof fake === "function") return fake(options, calls);
    throw new Error("transporte no configurado en la prueba");
  };
  const h = loader({
    "./plugins": {
      isPluginEnabled: async () => plugin.enabled ?? true,
      getPluginSecrets: async () =>
        plugin.secrets === undefined
          ? { login: "admin", password: "secreto-falso" }
          : plugin.secrets,
      getPluginConfig: async () =>
        plugin.config ?? { url: "https://da.ejemplo:2222", ipAddress: "203.0.113.10" },
    },
    "./outbound": {
      OutboundError,
      requestText: async () => {
        throw new Error("red real no permitida en la prueba");
      },
    },
    env: { DIRECTADMIN_ENABLED: "true", ...env },
  });
  const mod = h.load("lib/directadmin.ts");
  mod.__setDirectAdminFetch(transport);
  return { mod, calls };
}

const DA_CONFIG_ANA =
  "error=0&username=ana&domain=ana.com&suspended=no&account=ON&package=basic&ip=203.0.113.10";
const DA_CONFIG_BOB_SUSPENDED =
  "error=0&username=bob&domain=bob.com&suspended=yes&account=OFF&package=pro&ip=203.0.113.10";

test("directadmin: sin DIRECTADMIN_ENABLED, sin plugin activo o sin secretos → unconfigured 503, sin llamadas", async () => {
  const noEnv = loadDA({ env: { DIRECTADMIN_ENABLED: "false" } });
  await assert.rejects(() => noEnv.mod.directAdminPanel.listPackages(), (error) => {
    assert.equal(error.code, "unconfigured");
    assert.equal(error.httpStatus, 503);
    return true;
  });
  assert.equal(noEnv.calls.length, 0);

  const disabled = loadDA({ plugin: { enabled: false } });
  await assert.rejects(() => disabled.mod.directAdminPanel.listPackages(), (error) => error.code === "unconfigured");
  assert.equal(disabled.calls.length, 0);

  const noSecrets = loadDA({ plugin: { secrets: null } });
  await assert.rejects(() => noSecrets.mod.directAdminPanel.listPackages(), (error) => error.code === "unconfigured");
  assert.equal(noSecrets.calls.length, 0);
});

test("directadmin listPackages: parsea list[] url-encoded y usa Basic auth", async () => {
  const { mod, calls } = loadDA({
    fake: () => ({ status: 200, text: "list[]=basic&list[]=pro" }),
  });
  const packages = await mod.directAdminPanel.listPackages();
  same(packages, [{ name: "basic" }, { name: "pro" }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/da\.ejemplo:2222\/CMD_API_PACKAGES_USER\?json=yes$/);
  assert.equal(calls[0].method, "GET");
  same(calls[0].allowHosts, ["da.ejemplo"]);
  assert.match(calls[0].headers.Authorization, /^Basic /);
  assert.equal(calls[0].body, undefined);
});

test("directadmin listAccounts: SHOW_ALL_USERS + SHOW_USER_CONFIG por usuario", async () => {
  const { mod, calls } = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_ALL_USERS")) return { status: 200, text: '["ana","bob"]' };
      if (url.includes("user=ana")) return { status: 200, text: DA_CONFIG_ANA };
      if (url.includes("user=bob")) return { status: 200, text: DA_CONFIG_BOB_SUSPENDED };
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  const accounts = await mod.directAdminPanel.listAccounts();
  same(accounts, [
    { username: "ana", domain: "ana.com", suspended: false },
    { username: "bob", domain: "bob.com", suspended: true },
  ]);
  assert.equal(calls.length, 3);
});

test("directadmin createAccount: POST form con action=create y la IP configurada", async () => {
  const { mod, calls } = loadDA({
    fake: () => ({ status: 200, text: "error=0&text=User+created&details=ok" }),
  });
  const result = await mod.directAdminPanel.createAccount({
    domain: "midominio.com",
    username: "ana1",
    password: "clave-falsa",
    plan: "basic",
    email: "ana@example.com",
  });
  same(result, { username: "ana1", domain: "midominio.com" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/CMD_API_ACCOUNT_USER\?json=yes$/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].contentType, "application/x-www-form-urlencoded");
  same(calls[0].bodyParams, {
    action: "create",
    add: "Submit",
    username: "ana1",
    email: "ana@example.com",
    passwd: "clave-falsa",
    passwd2: "clave-falsa",
    domain: "midominio.com",
    package: "basic",
    ip: "203.0.113.10",
    notify: "no",
  });
});

test("directadmin createAccount: usuario fuera de 4-8 alfanuméricos o sin IP → invalid sin llamadas", async () => {
  const short = loadDA({});
  await assert.rejects(
    () =>
      short.mod.directAdminPanel.createAccount({
        domain: "midominio.com",
        username: "ab",
        password: "clave-falsa",
        plan: "basic",
        email: "ana@example.com",
      }),
    (error) => error.code === "invalid",
  );
  const long = loadDA({});
  await assert.rejects(
    () =>
      long.mod.directAdminPanel.createAccount({
        domain: "midominio.com",
        username: "usuario123",
        password: "clave-falsa",
        plan: "basic",
        email: "ana@example.com",
      }),
    (error) => error.code === "invalid",
  );
  const noIp = loadDA({ plugin: { config: { url: "https://da.ejemplo:2222", ipAddress: "" } } });
  await assert.rejects(
    () =>
      noIp.mod.directAdminPanel.createAccount({
        domain: "midominio.com",
        username: "ana1",
        password: "clave-falsa",
        plan: "basic",
        email: "ana@example.com",
      }),
    (error) => error.code === "invalid",
  );
  assert.equal(short.calls.length, 0);
  assert.equal(long.calls.length, 0);
  assert.equal(noIp.calls.length, 0);
});

test("directadmin createAccount: error=1 → upstream sin el texto crudo", async () => {
  const { mod } = loadDA({
    fake: () => ({
      status: 200,
      text: "error=1&text=texto+interno+que+no+debe+salir&details=detalle+interno",
    }),
  });
  await assert.rejects(
    () =>
      mod.directAdminPanel.createAccount({
        domain: "midominio.com",
        username: "ana1",
        password: "clave-falsa",
        plan: "basic",
        email: "ana@example.com",
      }),
    (error) => {
      assert.equal(error.code, "upstream");
      assert.doesNotMatch(error.message, /texto interno|detalle interno/);
      return true;
    },
  );
});

test("directadmin suspend: activo → POST SELECT_USERS; ya suspendido → no llama", async () => {
  const active = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_USER_CONFIG")) return { status: 200, text: DA_CONFIG_ANA };
      if (url.includes("CMD_API_SELECT_USERS")) {
        return { status: 302, text: "", headers: { location: "CMD_SELECT_USERS" } };
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await active.mod.directAdminPanel.suspendAccount({ username: "ana" });
  assert.equal(active.calls.length, 2);
  assert.equal(active.calls[1].bodyParams.location, "CMD_SELECT_USERS");
  assert.equal(active.calls[1].bodyParams.suspend, "Suspend/Unsuspend");
  assert.equal(active.calls[1].bodyParams.select0, "ana");

  const already = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_USER_CONFIG")) return { status: 200, text: DA_CONFIG_BOB_SUSPENDED };
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await already.mod.directAdminPanel.suspendAccount({ username: "bob" });
  assert.equal(already.calls.length, 1);
});

test("directadmin unsuspend: suspendido → POST SELECT_USERS; activo → no llama", async () => {
  const suspended = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_USER_CONFIG")) return { status: 200, text: DA_CONFIG_BOB_SUSPENDED };
      if (url.includes("CMD_API_SELECT_USERS")) {
        return { status: 302, text: "", headers: { location: "CMD_SELECT_USERS" } };
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await suspended.mod.directAdminPanel.unsuspendAccount({ username: "bob" });
  assert.equal(suspended.calls.length, 2);

  const active = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_USER_CONFIG")) return { status: 200, text: DA_CONFIG_ANA };
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await active.mod.directAdminPanel.unsuspendAccount({ username: "ana" });
  assert.equal(active.calls.length, 1);
});

test("directadmin suspend con redirección a otro sitio → upstream", async () => {
  const { mod } = loadDA({
    fake: ({ url }) => {
      if (url.includes("CMD_API_SHOW_USER_CONFIG")) return { status: 200, text: DA_CONFIG_ANA };
      if (url.includes("CMD_API_SELECT_USERS")) {
        return { status: 302, text: "", headers: { location: "/CMD_LOGIN" } };
      }
      throw new Error(`llamada inesperada: ${url}`);
    },
  });
  await assert.rejects(() => mod.directAdminPanel.suspendAccount({ username: "ana" }), (error) => error.code === "upstream");
});

test("directadmin terminate: POST SELECT_USERS con confirmed y delete", async () => {
  const { mod, calls } = loadDA({
    fake: () => ({ status: 200, text: "error=0&text=User+deleted" }),
  });
  await mod.directAdminPanel.terminateAccount({ username: "ana" });
  assert.equal(calls.length, 1);
  same(calls[0].bodyParams, {
    confirmed: "Confirm",
    delete: "yes",
    select0: "ana",
  });
});

test("directadmin changePackage: not-supported 501 sin llamadas", async () => {
  const { mod, calls } = loadDA({});
  await assert.rejects(
    () => mod.directAdminPanel.changePackage({ username: "ana", plan: "pro" }),
    (error) => {
      assert.equal(error.code, "not-supported");
      assert.equal(error.httpStatus, 501);
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test("parseDaResponse: JSON, url-encoded y list[]", () => {
  const { mod } = loadDA({});
  same(mod.parseDaResponse('{"error":"0","text":"ok"}'), { error: "0", text: "ok" });
  same(mod.parseDaResponse('["ana","bob"]'), ["ana", "bob"]);
  same(mod.parseDaResponse("error=0&suspended=no&domain=ana.com"), {
    error: "0",
    suspended: "no",
    domain: "ana.com",
  });
  same(mod.parseDaResponse("list[]=basic&list[]=pro"), ["basic", "pro"]);
  assert.equal(mod.parseDaResponse(""), null);
  assert.equal(mod.parseDaSuspended({ suspended: "yes" }), true);
  assert.equal(mod.parseDaSuspended({ suspended: "no" }), false);
  assert.equal(mod.parseDaSuspended({}), null);
});

/* ------------------------------ manifiestos ------------------------------ */

test("manifiestos plesk y directadmin: kind panel, url obligatoria, transporte propio", () => {
  const h = loader({
    "@/lib/db": {
      db: {
        plugin: {
          findMany: async () => [],
          findUnique: async () => null,
        },
        adminAudit: { create: async () => ({}) },
      },
    },
  });
  const plugins = h.load("lib/plugins.ts");
  const plesk = plugins.getManifest("plesk");
  const da = plugins.getManifest("directadmin");
  assert.ok(plesk, "falta el manifiesto de plesk");
  assert.ok(da, "falta el manifiesto de directadmin");
  assert.equal(plesk.kind, "panel");
  assert.equal(da.kind, "panel");
  assert.ok(plesk.configSchema.some((field) => field.name === "url" && field.required));
  assert.ok(plesk.configSchema.some((field) => field.name === "mode"));
  assert.ok(plesk.configSchema.some((field) => field.name === "ipAddress"));
  assert.ok(plesk.secretFields.some((field) => field.name === "login"));
  assert.ok(plesk.secretFields.some((field) => field.name === "password"));
  assert.ok(plesk.secretFields.some((field) => field.name === "secretKey"));
  assert.ok(da.configSchema.some((field) => field.name === "url" && field.required));
  assert.ok(da.secretFields.some((field) => field.name === "login"));
  assert.ok(da.secretFields.some((field) => field.name === "password"));
  assert.equal(plesk.transport, "lib/plesk.ts");
  assert.equal(da.transport, "lib/directadmin.ts");
  assert.ok(plesk.capabilities.includes("change-package"));
  assert.ok(!da.capabilities.includes("change-package"));
});

/* ------------------------------ ruta test-connection ------------------------------ */

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

function routeSetup({ permissions = ["settings:write"], session = true, panels = {} } = {}) {
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
      listPlugins: async () => [],
      getPlugin: async () => null,
      setPluginEnabled: async () => {},
      setPluginSecrets: async () => {},
      updatePluginConfig: async () => ({}),
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/plesk": {
      pleskPanel: panels.plesk ?? {
        listPackages: async () => {
          throw Object.assign(new Error("sin credenciales"), { httpStatus: 503, code: "unconfigured" });
        },
      },
    },
    "@/lib/directadmin": {
      directAdminPanel: panels.directadmin ?? {
        listPackages: async () => {
          throw Object.assign(new Error("sin credenciales"), { httpStatus: 503, code: "unconfigured" });
        },
      },
    },
    "@/lib/whm": {
      whmRead: panels.whm ?? (async () => {
        throw Object.assign(new Error("pendiente"), { code: "pending" });
      }),
    },
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
  return { route };
}

test("ruta test-connection plesk: solo listPackages, devuelve ok con el número de planes", async () => {
  const calls = [];
  const { route } = routeSetup({
    panels: {
      plesk: {
        listPackages: async () => {
          calls.push("listPackages");
          return [{ name: "base_plan" }, { name: "pro_plan" }];
        },
      },
    },
  });
  const res = await route.POST(fakeReq({ action: "test-connection", key: "plesk" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.detail, /2 plan/);
  same(calls, ["listPackages"]);
});

test("ruta test-connection directadmin: ok con paquetes", async () => {
  const { route } = routeSetup({
    panels: {
      directadmin: { listPackages: async () => [{ name: "basic" }] },
    },
  });
  const res = await route.POST(fakeReq({ action: "test-connection", key: "directadmin" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.detail, /1 paquete/);
});

test("ruta test-connection whm: usa el test existente", async () => {
  const { route } = routeSetup({
    panels: {
      whm: async () => ({ connected: true, checkedAt: "2026-11-18T00:00:00Z", accounts: 3, packages: 2 }),
    },
  });
  const res = await route.POST(fakeReq({ action: "test-connection", key: "whm" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.detail, /3 cuenta\(s\), 2 paquete\(s\)/);
});

test("ruta test-connection de un plugin sin prueba: 501 honesto", async () => {
  const { route } = routeSetup();
  const res = await route.POST(fakeReq({ action: "test-connection", key: "stripe" }));
  assert.equal(res.status, 501);
  const body = await res.json();
  assert.match(body.error, /no tiene prueba de conexión/);
});

test("ruta test-connection sin credenciales: 503 del adaptador, sin secretos", async () => {
  const { route } = routeSetup();
  const res = await route.POST(fakeReq({ action: "test-connection", key: "plesk" }));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /sin credenciales/);
  assert.doesNotMatch(JSON.stringify(body), /secreto-falso|sk_/);
});

test("ruta test-connection sin settings:write: 403 y no llama al panel", async () => {
  const calls = [];
  const { route } = routeSetup({
    permissions: ["tickets:view"],
    panels: {
      plesk: {
        listPackages: async () => {
          calls.push("listPackages");
          return [];
        },
      },
    },
  });
  const res = await route.POST(fakeReq({ action: "test-connection", key: "plesk" }));
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});
