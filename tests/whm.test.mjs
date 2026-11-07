// All WHM data/credentials/network below are LOCAL TEST CANARIES, never real services.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "TEST_ONLY_TOKEN_CANARY_123456789";
const HOST = "https://whm.example.net:2087";
function loader(mocks = {}) {
  const cache = new Map(),
    states = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useId: () => "test-id",
    useEffect: () => {},
    useRef(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = { current: initial };
      return states[i];
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in states))
        states[i] = typeof initial === "function" ? initial() : initial;
      return [
        states[i],
        (v) => {
          states[i] = typeof v === "function" ? v(states[i]) : v;
        },
      ];
    },
  };
  function load(name) {
    const file = resolve(root, name);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (id === "react") return hooks;
      if (id === "@/lib/auth") return { requireAdmin: async () => {} };
      if (id === "@/lib/db") return { db: {} };
      if (id === "node:dns/promises")
        return {
          lookup: async () => {
            throw Error("Unexpected DNS");
          },
        };
      if (id === "node:https")
        return {
          request: () => {
            throw Error("Unexpected network");
          },
        };
      if (id === "next/link")
        return ({ children, ...props }) =>
          React.createElement("a", props, children);
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
        AbortController,
        Buffer,
        Request,
        Response,
        Headers,
        structuredClone,
        setTimeout: mocks.setTimeout ?? setTimeout,
        clearTimeout: mocks.clearTimeout ?? clearTimeout,
        process: {
          env: {
            SETTINGS_ENCRYPTION_KEY: "ab".repeat(32),
            NODE_ENV: "production",
            ...mocks.env,
          },
        },
        fetch:
          mocks.fetch ??
          (() => {
            throw Error("Unexpected browser network");
          }),
        console,
      },
      { filename: file },
    );
    return module.exports;
  }
  return {
    load,
    render(Component, props) {
      cursor = 0;
      return Component(props);
    },
  };
}
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props?.children).flatMap((child) =>
      nodes(child, predicate),
    ),
  ];
}
function request(body, origin = "https://app.example.net") {
  return new NextRequest("https://app.example.net/api/admin/whm", {
    method: "POST",
    headers: {
      host: "app.example.net",
      ...(origin ? { origin } : {}),
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function transportMock({
  status = 200,
  result = 1,
  command = "listaccts",
  data = { acct: [] },
  raw,
  fail = false,
} = {}) {
  const calls = [];
  return {
    calls,
    module: {
      request(url, options, callback) {
        calls.push({ url, options });
        const req = new EventEmitter();
        req.destroy = () => {
          queueMicrotask(() => req.emit("close"));
        };
        req.end = (body) => {
          calls[calls.length - 1].body = body;
          return queueMicrotask(() => {
            if (fail) {
              req.emit("error", Error(TOKEN + " private transport stack"));
              req.emit("close");
              return;
            }
            const res = new EventEmitter();
            res.statusCode = status;
            res.destroyed = false;
            res.destroy = () => {
              res.destroyed = true;
            };
            callback(res);
            if (!res.destroyed) {
              res.emit(
                "data",
                Buffer.from(
                  raw ??
                    JSON.stringify({
                      metadata: { result, command, version: 1, reason: TOKEN },
                      data,
                    }),
                ),
              );
              if (!res.destroyed) res.emit("end");
            }
            req.emit("close");
          });
        };
        return req;
      },
    },
  };
}

test("WHM URL/SSRF rejects private, alternate loopback, credentials, paths, ports and reserved IPv6", () => {
  const { whmBase, isPublicAddress } = loader().load("lib/whm-security.ts");
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "100.100.100.200",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.1",
    "192.0.2.2",
    "198.18.1.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "::ffff:8.8.8.8",
    "fc00::1",
    "fe80::1",
    "2002:808:808::1",
    "2001:db8::1",
    "2001::1",
    "3fff::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of [
    "8.8.8.8",
    "1.1.1.1",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
  ])
    assert.equal(isPublicAddress(address), true, address);
  for (const url of [
    "http://whm.example.net:2087",
    "https://127.1:2087",
    "https://2130706433:2087",
    "https://0x7f000001:2087",
    "https://[::1]:2087",
    "https://whm.example.net:443",
    "https://u:p@whm.example.net:2087",
    "https://whm.example.net:2087/json-api/createacct",
    "https://whm.example.net:2087/?token=secret",
    "https://whm.example.net:2087/#secret",
    "https://localhost:2087",
    "https://metadata.google.internal:2087",
  ])
    assert.throws(() => whmBase(url));
  assert.equal(whmBase("https://whm.example.net"), HOST);
});
test("all DNS answers must be public; blocked DNS never sends Authorization", async () => {
  const t = transportMock();
  const h = loader({
    "node:https": t.module,
    "node:dns/promises": {
      lookup: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    },
  });
  await assert.rejects(
    h
      .load("lib/whm-transport.ts")
      .readWhm(HOST, { username: "root", token: TOKEN }, "listaccts"),
    (e) => e.code === "blocked",
  );
  assert.equal(t.calls.length, 0);
});
test("HTTPS read pins public DNS, original hostname/TLS, fixed path and secret only in header", async () => {
  let dns = 0;
  const t = transportMock();
  const h = loader({
    "node:https": t.module,
    "node:dns/promises": {
      lookup: async () => {
        dns++;
        return [{ address: "8.8.8.8", family: 4 }];
      },
    },
  });
  const data = await h
    .load("lib/whm-transport.ts")
    .readWhm(HOST, { username: "root", token: TOKEN }, "listaccts");
  assert.equal(data.total, 0);
  assert.equal(dns, 1);
  const { url, options } = t.calls[0];
  assert.equal(url.origin, HOST);
  assert.equal(url.pathname, "/json-api/listaccts");
  assert.equal(url.searchParams.get("api.version"), "1");
  assert.ok(!url.href.includes(TOKEN));
  assert.ok(!url.href.includes("root"));
  assert.equal(options.headers.Authorization, `whm root:${TOKEN}`);
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.family, 4);
  options.lookup("ignored", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  assert.equal(dns, 1);
});
test("allowlist rejects mutation commands before DNS/network; username/token reject header injection", async () => {
  const h = loader(),
    t = h.load("lib/whm-transport.ts"),
    s = h.load("lib/whm-security.ts");
  for (const command of [
    "createacct",
    "suspendacct",
    "passwd",
    "__proto__",
    "constructor",
    "listaccts?x=1",
  ])
    await assert.rejects(
      t.readWhm(HOST, { username: "root", token: TOKEN }, command),
      (e) => e.code === "invalid",
    );
  assert.throws(() => s.validateIdentity("root\r\nX-Evil", TOKEN));
  assert.throws(() => s.validateIdentity("root", TOKEN + "\r\n"));
});
test("HTTP200 metadata failure, redirects, malformed/oversized responses and network errors are never success or raw errors", async () => {
  for (const scenario of [
    { result: 0 },
    { command: "createacct" },
    { status: 302 },
    { status: 401 },
    { raw: "not-json " + TOKEN },
    { raw: "x".repeat(2 * 1024 * 1024 + 1) },
    { fail: true },
  ]) {
    const mock = transportMock(scenario);
    const h = loader({
      "node:https": mock.module,
      "node:dns/promises": {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      },
    });
    await assert.rejects(
      h
        .load("lib/whm-transport.ts")
        .readWhm(HOST, { username: "root", token: TOKEN }, "listaccts"),
      (error) =>
        !error.message.includes(TOKEN) &&
        !error.message.includes("private transport"),
    );
    assert.equal(mock.calls.length, 1);
  }
});
test("response mapping limits rows, drops extra fields, redacts token and preserves genuine empty lists", () => {
  const { parseWhmResponse } = loader().load("lib/whm-transport.ts");
  const parsed = parseWhmResponse(
    {
      metadata: { result: 1, command: "listaccts", version: 1 },
      data: {
        acct: Array.from({ length: 101 }, () => ({
          user: "TEST_USER",
          domain: TOKEN,
          password: TOKEN,
          plan: "test-package",
          suspended: 0,
        })),
      },
    },
    "listaccts",
    TOKEN,
  );
  assert.equal(parsed.rows.length, 100);
  assert.equal(parsed.total, 101);
  assert.equal(parsed.truncated, true);
  assert.ok(!JSON.stringify(parsed).includes(TOKEN));
  assert.ok(!("password" in parsed.rows[0]));
  assert.equal(
    parseWhmResponse(
      {
        metadata: { result: 1, command: "listpkgs", version: 1 },
        data: { pkg: [] },
      },
      "listpkgs",
      TOKEN,
    ).total,
    0,
  );
});
test("AES-GCM uses fresh IV, separates WHM context, tamper rejects safely and public config never returns credentials", () => {
  const h = loader(),
    w = h.load("lib/whm.ts");
  const credentials = { username: "root", token: TOKEN };
  const a = w.encryptWhm(credentials),
    b = w.encryptWhm(credentials);
  assert.notEqual(a, b);
  assert.ok(!a.includes(TOKEN));
  assert.equal(w.decryptWhm(a).token, TOKEN);
  const damaged = a.split(":");
  damaged[2] = (damaged[2][0] === "0" ? "1" : "0") + damaged[2].slice(1);
  assert.throws(() => w.decryptWhm(damaged.join(":")));
  assert.throws(() => w.decryptWhm(a.replace("v1:", "")));
  const publicConfig = w.publicWhmConfig(HOST, credentials);
  assert.ok(publicConfig.hasToken);
  assert.equal(publicConfig.state, "unverified");
  assert.ok(!JSON.stringify(publicConfig).includes(TOKEN));
  assert.ok(!("token" in publicConfig));
  assert.equal(
    w.publicWhmConfig(HOST, { username: "root", token: "" }).state,
    "pending",
  );
  assert.throws(
    () =>
      loader({ env: { SETTINGS_ENCRYPTION_KEY: "" } })
        .load("lib/whm.ts")
        .encryptWhm(credentials),
    (e) => e.code === "key",
  );
});
test("empty token preserves existing only for same identity; partial config stays pending and unknown payload rejected", () => {
  const w = loader().load("lib/whm.ts"),
    previous = {
      endpoint: HOST,
      credentials: { username: "reseller", token: TOKEN },
    };
  const merged = w.mergeWhmInput(
    { url: HOST, username: "reseller", token: "" },
    previous,
  );
  assert.equal(merged.credentials.token, TOKEN);
  assert.throws(
    () =>
      w.mergeWhmInput(
        {
          url: "https://other.example.net:2087",
          username: "reseller",
          token: "",
        },
        previous,
      ),
    (e) => e.code === "identity",
  );
  assert.throws(
    () => w.mergeWhmInput({ url: HOST, username: "root", token: "" }, previous),
    (e) => e.code === "identity",
  );
  assert.equal(
    w.mergeWhmInput({ url: HOST, username: "reseller", token: "" }).credentials
      .token,
    "",
  );
  assert.throws(() =>
    w.mergeWhmInput({
      url: HOST,
      username: "root",
      token: TOKEN,
      identifier: "legacy",
    }),
  );
});
test("storage uses whm id transaction, preserves legacy row, no raw token in audit or API output", async () => {
  const calls = [];
  const db = {
    integrationConfig: {
      findUnique: async (query) => {
        calls.push(query);
        return null;
      },
      upsert: (value) => {
        calls.push(value);
        return Promise.resolve({});
      },
    },
    adminAudit: {
      create: (value) => {
        calls.push(value);
        return Promise.resolve({});
      },
    },
    $transaction: async (work) => Promise.all(work),
  };
  const w = loader({ "@/lib/db": { db } }).load("lib/whm.ts");
  const response = await w.saveWhmConfiguration({
    url: HOST,
    username: "root",
    token: TOKEN,
  });
  assert.equal(calls[0].where.id, "whm");
  assert.equal(calls[1].where.id, "whm");
  assert.ok(calls[1].create.encryptedCredentials.startsWith("v1:"));
  assert.ok(!JSON.stringify(calls).includes(TOKEN));
  assert.ok(!JSON.stringify(response).includes(TOKEN));
  assert.ok(!JSON.stringify(calls).includes('"whmcs"'));
});
test("test checks both metadata-backed reads; no config means no network and failed first read stops second", async () => {
  let calls = 0;
  const db = { integrationConfig: { findUnique: async () => null } };
  let h = loader({
    "@/lib/db": { db },
    "@/lib/whm-transport": {
      readWhm: async () => {
        calls++;
      },
    },
  });
  await assert.rejects(
    h.load("lib/whm.ts").whmRead("test"),
    (e) => e.code === "pending",
  );
  assert.equal(calls, 0);
  h = loader({
    "@/lib/db": { db },
    "@/lib/whm-transport": {
      readWhm: async () => {
        calls++;
        throw Error(TOKEN);
      },
    },
  });
  let w = h.load("lib/whm.ts");
  db.integrationConfig.findUnique = async () => ({
    endpoint: HOST,
    encryptedCredentials: w.encryptWhm({ username: "root", token: TOKEN }),
  });
  await assert.rejects(w.whmRead("test"));
  assert.equal(calls, 1);
  const actions = [];
  h = loader({
    "@/lib/db": { db },
    "@/lib/whm-transport": {
      readWhm: async (_url, _credentials, action) => {
        actions.push(action);
        return { rows: [], total: 0, truncated: false };
      },
    },
  });
  w = h.load("lib/whm.ts");
  db.integrationConfig.findUnique = async () => ({
    endpoint: HOST,
    encryptedCredentials: w.encryptWhm({ username: "root", token: TOKEN }),
  });
  const result = await w.whmRead("test");
  assert.equal(result.connected, true);
  assert.equal(result.metadata.listaccts, 1);
  assert.equal(result.metadata.listpkgs, 1);
  assert.deepEqual(actions, ["listaccts", "listpkgs"]);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});
test("routes enforce admin then same HTTPS Origin before any storage or upstream request", async () => {
  for (const scenario of [
    "unauth",
    "no-origin",
    "cross-origin",
    "http-origin",
  ]) {
    let reads = 0;
    const h = loader({
      "@/lib/auth": {
        requireAdmin: async () => {
          if (scenario === "unauth") throw Error(TOKEN);
        },
      },
      "@/lib/whm": {
        whmRead: async () => {
          reads++;
          return {};
        },
      },
    });
    const origin =
      scenario === "no-origin"
        ? ""
        : scenario === "cross-origin"
          ? "https://evil.example.net"
          : scenario === "http-origin"
            ? "http://app.example.net"
            : "https://app.example.net";
    const response = await h
      .load("app/api/admin/whm/route.ts")
      .POST(request({ operation: "test" }, origin));
    assert.equal(response.status, scenario === "unauth" ? 401 : 403);
    assert.equal(reads, 0);
    assert.ok(!(await response.text()).includes(TOKEN));
  }
});
test("route allowlist/body limits and errors are sanitized, masked GET works, legacy endpoints do not activate WHMCS", async () => {
  let calls = 0;
  const h = loader({
    "@/lib/whm": {
      whmRead: async () => {
        calls++;
        throw Error(TOKEN);
      },
      whmConfiguration: async () => ({
        url: HOST,
        username: "root",
        configured: false,
        hasToken: false,
        state: "pending",
      }),
    },
  });
  const route = h.load("app/api/admin/whm/route.ts");
  for (const body of [
    { operation: "createacct" },
    { operation: ["test"] },
    { operation: "test", url: HOST },
    "x".repeat(9000),
  ])
    assert.equal((await route.POST(request(body))).status, 400);
  assert.equal(calls, 0);
  const failure = await route.POST(request({ operation: "test" }));
  assert.equal(failure.status, 502);
  assert.ok(!(await failure.text()).includes(TOKEN));
  const settings = await h
    .load("app/api/admin/whm/settings/route.ts")
    .GET(new NextRequest("https://app.example.net/api/admin/whm/settings"));
  assert.equal(settings.status, 200);
  assert.match(settings.headers.get("cache-control"), /no-store/);
  assert.ok(!("token" in (await settings.json())));
  assert.equal(
    (
      await h
        .load("app/api/admin/whmcs/route.ts")
        .GET(new NextRequest("https://app.example.net/api/admin/whmcs"))
    ).status,
    410,
  );
  assert.equal(
    (await h.load("app/api/admin/settings/route.ts").POST(request({}))).status,
    410,
  );
});
test("settings UI starts pending, password empty; save clears typed token and metadata failure is not connected", async () => {
  const requests = [];
  let connectionFails = false;
  const initial = {
    url: HOST,
    username: "root",
    configured: false,
    hasToken: false,
    state: "pending",
  };
  const h = loader({
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () =>
          connectionFails
            ? {
                connected: false,
                metadata: { listaccts: 0, listpkgs: 0 },
                error: TOKEN,
              }
            : {
                ...initial,
                configured: true,
                hasToken: true,
                state: "unverified",
              },
      };
    },
  });
  const Form = h.load("components/SettingsForm.tsx").default,
    render = () => h.render(Form, { initial });
  assert.match(renderToStaticMarkup(render()), /Pendiente configuración/);
  nodes(render(), (n) => n.props?.type === "password")[0].props.onChange({
    target: { value: TOKEN },
  });
  await nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  assert.equal(requests[0].body.token, TOKEN);
  assert.equal(
    nodes(render(), (n) => n.props?.type === "password")[0].props.value,
    "",
  );
  assert.ok(!renderToStaticMarkup(render()).includes(TOKEN));
  connectionFails = true;
  await nodes(
    render(),
    (n) => n.type === "button" && n.props.type === "button",
  )[0].props.onClick();
  const html = renderToStaticMarkup(render());
  assert.match(html, /Prueba no confirmada/);
  assert.ok(!html.includes(TOKEN));
  assert.ok(!html.includes("Lectura verificada en esta sesión"));
});
test("active admin pages/API no longer import or call WHMCS; public catalog remains separate", () => {
  for (const name of [
    "app/admin/page.tsx",
    "app/admin/settings/page.tsx",
    "app/admin/[section]/page.tsx",
    "app/api/admin/settings/route.ts",
    "app/api/admin/whmcs/route.ts",
  ]) {
    const source = readFileSync(resolve(root, name), "utf8");
    assert.ok(!source.includes('from "@/lib/whmcs"'));
    assert.ok(!source.includes("whmcsCall("));
  }
  const client = readFileSync(
    resolve(root, "components/SettingsForm.tsx"),
    "utf8",
  );
  assert.ok(!client.includes("localStorage"));
  assert.ok(!client.includes("NEXT_PUBLIC"));
});

test("DNS and HTTPS have bounded deadlines and clean up timers without retry", async () => {
  const timers = [];
  const set = (fn, ms) => {
    const timer = { fn, ms, cleared: false };
    timers.push(timer);
    return timer;
  };
  const clear = (timer) => {
    timer.cleared = true;
  };
  let h = loader({
    setTimeout: set,
    clearTimeout: clear,
    "node:dns/promises": { lookup: () => new Promise(() => {}) },
  });
  const pending = h
    .load("lib/whm-transport.ts")
    .publicTarget("whm.example.net");
  assert.equal(timers[0].ms, 3000);
  timers[0].fn();
  await assert.rejects(pending, (e) => e.code === "timeout");
  assert.equal(timers[0].cleared, true);
  let calls = 0;
  h = loader({
    setTimeout: set,
    clearTimeout: clear,
    "node:dns/promises": {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    },
    "node:https": {
      request() {
        calls++;
        const req = new EventEmitter();
        req.destroy = () => req.emit("close");
        req.end = () => timers.findLast((t) => t.ms === 10000).fn();
        return req;
      },
    },
  });
  await assert.rejects(
    h
      .load("lib/whm-transport.ts")
      .readWhm(HOST, { username: "root", token: TOKEN }, "listaccts"),
    (e) => e.code === "timeout",
  );
  assert.equal(calls, 1);
  assert.equal(timers.findLast((t) => t.ms === 10000).cleared, true);
});
test("configuration GET and save are admin guarded before storage, save additionally requires Origin", async () => {
  for (const scenario of ["unauth", "bad-origin"]) {
    let storage = 0;
    const h = loader({
      "@/lib/auth": {
        requireAdmin: async () => {
          if (scenario === "unauth") throw Error(TOKEN);
        },
      },
      "@/lib/whm": {
        whmConfiguration: async () => {
          storage++;
          return {};
        },
        saveWhmConfiguration: async () => {
          storage++;
          return {};
        },
      },
    });
    const route = h.load("app/api/admin/whm/settings/route.ts");
    const response = await route.POST(
      request(
        { url: HOST, username: "root", token: TOKEN },
        "https://evil.example.net",
      ),
    );
    assert.equal(response.status, scenario === "unauth" ? 401 : 403);
    assert.equal(storage, 0);
    if (scenario === "unauth") {
      const get = await route.GET(
        new NextRequest("https://app.example.net/api/admin/whm/settings"),
      );
      assert.equal(get.status, 401);
      assert.equal(storage, 0);
    }
  }
});

test("safe error serialization ignores even a mutated typed error message/stack/cause", () => {
  const w = loader().load("lib/whm-security.ts");
  const error = new w.WhmError("rejected");
  error.message = TOKEN;
  error.stack = TOKEN;
  error.cause = { token: TOKEN };
  const safe = w.safeWhmError(error);
  assert.equal(safe.code, "rejected");
  assert.equal(JSON.stringify(safe).includes(TOKEN), false);
});

// Management cases below use ONLY local canaries and mocked storage/WHM.
const PASS = "LOCAL_ONLY_Strong!Password987";
const creation = () => ({
  action: "createacct",
  username: "alice",
  domain: "alice.example.net",
  password: PASS,
  plan: "starter",
  confirmation: "alice",
  notificationsAcknowledged: true,
});
const packageInput = (action) => ({
  action,
  name: "starter",
  quota: "1024",
  bwlimit: "2048",
  maxpop: "10",
  maxsql: "5",
  confirmation: "starter",
  notificationsAcknowledged: true,
});
test("management schema allows only six concrete actions, strong explicit password, exact confirmation and notification acknowledgement", () => {
  const parse = loader().load(
    "lib/whm-management-schema.ts",
  ).parseWhmManagement;
  assert.equal(parse(creation()).params.showpass, "n");
  assert.equal(parse(creation()).params.forcedns, "0");
  assert.equal(parse(creation()).params.reseller, "0");
  assert.equal(parse(packageInput("addpkg")).params.maxpop, "10");
  for (const action of [
    "removeacct",
    "killpkg",
    "passwd",
    "api_token_create",
    "setacls",
    "https://evil.example.net",
  ]) {
    assert.throws(() => parse({ ...creation(), action }));
  }
  for (const patch of [
    { confirmation: "other" },
    { notificationsAcknowledged: false },
    { password: "weak" },
    { password: "alice_123456789ABCDEFGHIJKLMNOP!" },
    { username: "123abc" },
    { username: "testuser" },
    { domain: "https://example.net/x" },
    { endpoint: "https://evil.example.net:2087" },
    { contactemail: "nobody@example.net" },
    { owner: "root" },
    { reseller: "1" },
  ])
    assert.throws(() => parse({ ...creation(), ...patch }));
  for (const value of [
    "",
    "-1",
    "0",
    "1e4",
    "NaN",
    "Infinity",
    "1.5",
    "1000000000",
  ]) {
    assert.throws(() => parse({ ...packageInput("editpkg"), quota: value }));
  }
  assert.equal(
    parse({ ...packageInput("editpkg"), quota: "unlimited" }).params.quota,
    "unlimited",
  );
  assert.throws(() =>
    parse({
      action: "suspendacct",
      user: "alice",
      reason: "\r\nsecret",
      confirmation: "alice",
      notificationsAcknowledged: true,
    }),
  );
  assert.throws(() =>
    parse({
      action: "suspendacct",
      user: "alice",
      reason: " ",
      confirmation: "alice",
      notificationsAcknowledged: true,
    }),
  );
});
test("mutation HTTPS uses fixed POST form, never query secrets or raw WHM output; HTTP200 result0 fails", async () => {
  for (const result of [1, 0]) {
    const t = transportMock({
      command: "createacct",
      result,
      data: { password: PASS, token: TOKEN },
    });
    const h = loader({
      "node:https": t.module,
      "node:dns/promises": {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      },
    });
    const run = h
      .load("lib/whm-transport.ts")
      .writeWhm(HOST, { username: "root", token: TOKEN }, creation());
    if (result === 1)
      assert.deepEqual(JSON.parse(JSON.stringify(await run)), { ok: true });
    else
      await assert.rejects(
        run,
        (e) => e.code === "rejected" && !e.message.includes(TOKEN),
      );
    assert.equal(t.calls.length, 1);
    const call = t.calls[0];
    assert.equal(call.options.method, "POST");
    assert.equal(call.url.pathname, "/json-api/createacct");
    assert.equal(call.url.search, "");
    assert.equal(call.options.rejectUnauthorized, true);
    assert.equal(new URLSearchParams(call.body).get("password"), PASS);
    assert.equal(new URLSearchParams(call.body).get("showpass"), "n");
    assert.equal(call.url.href.includes(PASS), false);
    assert.equal(call.url.href.includes(TOKEN), false);
  }
});
test("mutation allowlist/confirmation/SSRF reject before transport and no mutation retries after network uncertainty", async () => {
  let calls = 0;
  const h = loader({
    "node:dns/promises": {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    },
    "node:https": {
      request() {
        calls++;
        throw Error(PASS + TOKEN);
      },
    },
  });
  const write = h.load("lib/whm-transport.ts").writeWhm;
  for (const input of [
    { ...creation(), action: "removeacct" },
    { ...creation(), confirmation: "wrong" },
  ])
    await assert.rejects(
      write(HOST, { username: "root", token: TOKEN }, input),
    );
  assert.equal(calls, 0);
  await assert.rejects(
    write(
      "https://127.0.0.1:2087",
      { username: "root", token: TOKEN },
      creation(),
    ),
    (e) => e.code === "blocked",
  );
  assert.equal(calls, 0);
  await assert.rejects(
    write(HOST, { username: "root", token: TOKEN }, creation()),
    (e) => e.code === "uncertain" && !e.message.includes(TOKEN),
  );
  assert.equal(calls, 1);
});
const originalPackage = () => ({
  metadata: { result: 1, command: "getpkginfo", version: 1 },
  data: {
    pkg: {
      QUOTA: "1024",
      BWLIMIT: "2048",
      MAXPOP: "10",
      MAXSQL: "5",
      CPMOD: "jupiter",
      FEATURELIST: "custom",
      LANG: "es",
      HASSHELL: "0",
      CGI: "1",
      IP: "0",
      DIGESTAUTH: "n",
      MAXFTP: "2",
      _PACKAGE_EXTENSIONS: "",
    },
  },
});
test("package edit preserves unrelated settings and refuses unknown extensions instead of resetting them", () => {
  const preserve = loader().load(
    "lib/whm-transport.ts",
  ).preservedPackageSettings;
  const params = preserve(originalPackage());
  assert.equal(params.featurelist, "custom");
  assert.equal(params.cpmod, "jupiter");
  assert.equal(params.language, "es");
  assert.equal(params.ip, "n");
  assert.equal(params.digestauth, "0");
  assert.equal(params.maxftp, "2");
  for (const patch of [
    { _PACKAGE_EXTENSIONS: "advanced" },
    { NEW_UNKNOWN_FEATURE: "value" },
    { FEATURELIST: null },
  ]) {
    const data = originalPackage();
    Object.assign(data.data.pkg, patch);
    assert.throws(
      () => preserve(data),
      (e) => e.code === "package_advanced",
    );
  }
});
function managementFixture({
  writeFailure = false,
  auditStartFails = false,
  auditEndFails = false,
  accountState = "0",
  packagesExist = true,
} = {}) {
  const writes = [],
    audits = [],
    reads = [];
  let h;
  const db = {
    integrationConfig: {
      findUnique: async () => ({
        endpoint: HOST,
        encryptedCredentials: "LOCAL_CIPHER_PLACEHOLDER",
      }),
    },
    adminAudit: {
      create: async (args) => {
        if (auditStartFails) throw Error(TOKEN);
        audits.push(args);
        return { id: "local-audit" };
      },
      update: async (args) => {
        if (auditEndFails) throw Error(TOKEN);
        audits.push(args);
        return {};
      },
    },
  };
  h = loader({
    "@/lib/db": { db },
    "@/lib/whm": { decryptWhm: () => ({ username: "root", token: TOKEN }) },
    "@/lib/whm-transport": {
      readWhm: async (_e, _c, action) => {
        reads.push(action);
        return {
          rows:
            action === "listaccts"
              ? [{ user: "alice", suspended: accountState }]
              : packagesExist
                ? [{ name: "starter" }]
                : [],
          total: 1,
          truncated: false,
        };
      },
      writeWhm: async (_e, _c, input) => {
        writes.push(input.action);
        if (writeFailure)
          throw new (h.load("lib/whm-security.ts").WhmError)("rejected");
        return { ok: true };
      },
    },
  });
  return {
    manage: h.load("lib/whm-management.ts").manageWhm,
    writes,
    audits,
    reads,
  };
}
test("management preflight validates current account state/package, audits safe actor/action/outcome/target only", async () => {
  const f = managementFixture();
  const input = {
    action: "suspendacct",
    user: "alice",
    reason: PASS,
    confirmation: "alice",
    notificationsAcknowledged: true,
  };
  const result = await f.manage(input);
  assert.equal(result.ok, true);
  assert.deepEqual(f.writes, ["suspendacct"]);
  assert.equal(f.audits.length, 2);
  const audit = JSON.stringify(f.audits);
  assert.equal(audit.includes(PASS), false);
  assert.equal(audit.includes(TOKEN), false);
  assert.equal(audit.includes(HOST), false);
  assert.match(audit, /configured-admin/);
  assert.match(audit, /confirmed/);
  const stale = managementFixture({ accountState: "1" });
  await assert.rejects(stale.manage(input), (e) => e.code === "conflict");
  assert.equal(stale.writes.length, 0);
  assert.match(JSON.stringify(stale.audits), /not-confirmed/);
  const unknown = managementFixture({ packagesExist: false });
  await assert.rejects(
    unknown.manage({
      action: "changepackage",
      user: "alice",
      pkg: "starter",
      confirmation: "alice",
      notificationsAcknowledged: true,
    }),
    (e) => e.code === "conflict",
  );
  assert.equal(unknown.writes.length, 0);
});
test("audit failure before dispatch prevents mutation; after confirmed mutation cannot encourage duplicate retry", async () => {
  const input = {
    action: "unsuspendacct",
    user: "alice",
    confirmation: "alice",
    notificationsAcknowledged: true,
  };
  const start = managementFixture({ auditStartFails: true, accountState: "1" });
  await assert.rejects(start.manage(input));
  assert.equal(start.writes.length, 0);
  const end = managementFixture({ auditEndFails: true, accountState: "1" });
  const result = await end.manage(input);
  assert.equal(result.ok, true);
  assert.equal(result.auditRecorded, false);
  assert.equal(end.writes.length, 1);
  const rejected = managementFixture({ writeFailure: true, accountState: "1" });
  await assert.rejects(rejected.manage(input), (e) => e.code === "rejected");
  assert.match(JSON.stringify(rejected.audits), /not-confirmed/);
});
test("management route authenticates and validates Origin before body/service; no generic GET or destructive endpoint", async () => {
  for (const scenario of ["unauth", "origin"]) {
    let calls = 0;
    const h = loader({
      "@/lib/auth": {
        requireAdmin: async () => {
          if (scenario === "unauth") throw Error(TOKEN);
        },
      },
      "@/lib/whm-management": {
        manageWhm: async () => {
          calls++;
          return { ok: true };
        },
      },
    });
    const route = h.load("app/api/admin/whm/manage/route.ts");
    const r = await route.POST(request(creation(), "https://evil.example.net"));
    assert.equal(r.status, scenario === "unauth" ? 401 : 403);
    assert.equal(calls, 0);
    assert.equal(route.GET, undefined);
    assert.equal(route.DELETE, undefined);
    assert.equal((await r.text()).includes(TOKEN), false);
  }
  const h = loader({
    "@/lib/whm-management": {
      manageWhm: async () => {
        throw Error(PASS + TOKEN);
      },
    },
  });
  const r = await h
    .load("app/api/admin/whm/manage/route.ts")
    .POST(request(creation()));
  const value = await r.text();
  assert.equal(value.includes(PASS), false);
  assert.equal(value.includes(TOKEN), false);
});
function field(tree, text) {
  const label = nodes(
    tree,
    (n) =>
      n.type === "label" &&
      React.Children.toArray(n.props.children)
        .filter((v) => typeof v === "string")
        .join("")
        .startsWith(text),
  )[0];
  assert.ok(label, `Missing label ${text}`);
  return nodes(label, (n) =>
    ["input", "select", "textarea"].includes(n.type),
  )[0];
}
test("account dialog does not send until typed confirmation+ack; clears password immediately, blocks duplicate pending submit", async () => {
  let finish,
    calls = 0,
    success = 0,
    body;
  const h = loader({
    fetch: async (_url, options) => {
      calls++;
      body = JSON.parse(options.body);
      return new Promise((resolve) => {
        finish = () =>
          resolve({
            ok: true,
            json: async () => ({
              ok: true,
              action: "createacct",
              target: "alice",
              auditRecorded: true,
            }),
          });
      });
    },
  });
  const Dialog = h.load("components/admin/WhmManagementDialog.tsx").default,
    props = {
      action: "createacct",
      packages: [{ name: "starter" }],
      onClose: () => {},
      onSuccess: () => {
        success++;
      },
    };
  const render = () => h.render(Dialog, props);
  assert.equal(calls, 0);
  await nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  assert.equal(calls, 0);
  for (const [label, value] of [
    ["Usuario cPanel", "alice"],
    ["Dominio principal", "alice.example.net"],
    ["Contraseña inicial", PASS],
    ["Paquete real", "starter"],
    ["Escribe", "alice"],
  ])
    field(render(), label).props.onChange({ target: { value } });
  nodes(
    render(),
    (n) => n.type === "input" && n.props.type === "checkbox",
  )[0].props.onChange({ target: { checked: true } });
  const pending = nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  assert.equal(field(render(), "Contraseña inicial").props.value, "");
  assert.equal(calls, 1);
  await nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  assert.equal(calls, 1);
  assert.equal(body.password, PASS);
  assert.equal(body.confirmation, "alice");
  finish();
  await pending;
  assert.equal(success, 1);
});
test("uncertain management response locks resubmit, never renders raw errors or password", async () => {
  let calls = 0;
  const h = loader({
    fetch: async () => {
      calls++;
      throw Error(PASS + TOKEN);
    },
  });
  const Dialog = h.load("components/admin/WhmManagementDialog.tsx").default,
    props = {
      action: "unsuspendacct",
      row: { user: "alice" },
      packages: [],
      onClose: () => {},
      onSuccess: () => assert.fail("Must not claim success"),
    };
  const render = () => h.render(Dialog, props);
  field(render(), "Escribe").props.onChange({ target: { value: "alice" } });
  nodes(
    render(),
    (n) => n.type === "input" && n.props.type === "checkbox",
  )[0].props.onChange({ target: { checked: true } });
  await nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  const tree = render();
  assert.equal(
    nodes(tree, (n) => n.type === "button" && n.props.type === "submit")[0]
      .props.disabled,
    true,
  );
  const html = renderToStaticMarkup(tree);
  assert.equal(html.includes(PASS), false);
  assert.equal(html.includes(TOKEN), false);
  assert.match(html, /Podría haberse aplicado/);
  await nodes(render(), (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  assert.equal(calls, 1);
});

test("editpkg transport fetches real config then sends preserved options plus explicit quota patch; extensions stop before write", async () => {
  for (const advanced of [false, true]) {
    const pkg = originalPackage();
    if (advanced) pkg.data.pkg._PACKAGE_EXTENSIONS = "third-party-extension";
    const read = transportMock({ command: "getpkginfo", data: pkg.data }),
      write = transportMock({ command: "editpkg", data: { pkg: "starter" } });
    const h = loader({
      "node:dns/promises": {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      },
      "node:https": {
        request: (url, ...args) =>
          (url.pathname.endsWith("getpkginfo") ? read : write).module.request(
            url,
            ...args,
          ),
      },
    });
    const call = h
      .load("lib/whm-transport.ts")
      .writeWhm(
        HOST,
        { username: "root", token: TOKEN },
        { ...packageInput("editpkg"), quota: "4096" },
      );
    if (advanced) {
      await assert.rejects(call, (e) => e.code === "package_advanced");
      assert.equal(write.calls.length, 0);
    } else {
      await call;
      assert.equal(read.calls.length, 1);
      assert.equal(read.calls[0].options.method, "GET");
      assert.equal(read.calls[0].url.searchParams.get("pkg"), "starter");
      assert.equal(write.calls.length, 1);
      const body = new URLSearchParams(write.calls[0].body);
      assert.equal(body.get("quota"), "4096");
      assert.equal(body.get("featurelist"), "custom");
      assert.equal(body.get("cpmod"), "jupiter");
      assert.equal(body.get("maxftp"), "2");
      assert.equal(write.calls[0].url.search, "");
    }
  }
});
test("all management operations execute only their validated fixed action; missing package and invalid confirmation never dispatch", async () => {
  for (const input of [
    {
      ...creation(),
      username: "bob",
      domain: "bob.example.net",
      confirmation: "bob",
    },
    {
      action: "changepackage",
      user: "alice",
      pkg: "starter",
      confirmation: "alice",
      notificationsAcknowledged: true,
    },
    packageInput("editpkg"),
    { ...packageInput("addpkg"), name: "newplan", confirmation: "newplan" },
  ]) {
    const f = managementFixture();
    const result = await f.manage(input);
    assert.equal(result.ok, true);
    assert.deepEqual(f.writes, [input.action]);
  }
  const f = managementFixture();
  await assert.rejects(f.manage({ ...creation(), confirmation: "incorrect" }));
  assert.equal(f.reads.length, 0);
  assert.equal(f.audits.length, 0);
  assert.equal(f.writes.length, 0);
});
test("account table actions reflect actual suspension state and opening a dialog never mutates", () => {
  let mutations = 0;
  const h = loader({
    fetch: async () => {
      mutations++;
      throw Error("Forbidden real network");
    },
    "@/components/admin/useWhmAutoRead": {
      useWhmAutoRead: (operation) => ({
        result:
          operation === "listpkgs"
            ? { rows: [{ name: "starter" }], total: 1, truncated: false }
            : {
                rows: [
                  {
                    user: "alice",
                    domain: "alice.example.net",
                    plan: "starter",
                    suspended: "1",
                    diskused: "1",
                    disklimit: "100",
                  },
                ],
                total: 1,
                truncated: false,
              },
        lastRead: "2026-11-06T12:00:00Z",
        busy: false,
        error: false,
        paused: false,
        refresh() {},
      }),
    },
  });
  const Panel = h.load("components/admin/WhmReadPanel.tsx").default,
    render = () => h.render(Panel, { configured: true, mode: "listaccts" });
  const tree = render();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Reactivar cuenta/);
  assert.equal(html.includes("Suspender cuenta"), false);
  const button = nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Reactivar cuenta",
  )[0];
  assert.ok(button);
  button.props.onClick();
  assert.equal(mutations, 0);
  const after = render();
  const modal = nodes(
    after,
    (n) => typeof n.type === "function" && n.props.action === "unsuspendacct",
  )[0];
  assert.equal(modal.props.row.user, "alice");
  assert.equal(mutations, 0);
});

test("stale account UI keeps verified previous rows on refresh failure and never invents an empty zero", () => {
  const h = loader({
    "@/components/admin/useWhmAutoRead": {
      useWhmAutoRead: () => ({
        result: {
          rows: [
            {
              user: "alice",
              domain: "alice.example.net",
              plan: "starter",
              suspended: "0",
              diskused: "5",
              disklimit: "100",
            },
          ],
          total: 1,
          truncated: false,
        },
        lastRead: "2026-11-06T12:00:00Z",
        busy: false,
        error: true,
        paused: false,
        refresh() {},
      }),
    },
  });
  const tree = h.render(h.load("components/admin/WhmReadPanel.tsx").default, {
    configured: true,
    mode: "listaccts",
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /alice.example.net/);
  assert.match(html, /Datos anteriores/);
  assert.match(html, /Halifax/);
  assert.equal(html.includes("No hay registros accesibles"), false);
});
test("initial automatic dashboard loading renders unavailable dashes instead of fabricated zero metrics", () => {
  const h = loader({
    "@/components/admin/useWhmAutoRead": {
      useWhmAutoRead: () => ({
        result: null,
        lastRead: null,
        busy: true,
        error: false,
        paused: false,
        refresh() {},
      }),
    },
  });
  const tree = h.render(h.load("components/admin/WhmReadPanel.tsx").default, {
    configured: true,
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /<strong>—<\/strong>/);
  assert.equal(html.includes("<strong>0</strong>"), false);
});

test("package HTML validation is valid under modern browser v flag and permits reseller-style names", () => {
  const h = loader();
  const Dialog = h.load("components/admin/WhmManagementDialog.tsx").default;
  const tree = h.render(Dialog, {
    action: "addpkg",
    packages: [],
    onClose() {},
    onSuccess() {},
  });
  const name = field(tree, "Nombre del paquete");
  const pattern = new RegExp(`^(?:${name.props.pattern})$`, "v");
  assert.equal(pattern.test("reseller_business-pro"), true);
  assert.equal(pattern.test("../escape"), false);
});
