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
    useRef: () => ({ current: null }),
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
        req.end = () =>
          queueMicrotask(() => {
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
  const damaged=a.split(":"); damaged[2]=(damaged[2][0]==="0"?"1":"0")+damaged[2].slice(1);
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
  const timers=[];
  const set=(fn,ms)=>{const timer={fn,ms,cleared:false};timers.push(timer);return timer;};
  const clear=timer=>{timer.cleared=true;};
  let h=loader({setTimeout:set,clearTimeout:clear,"node:dns/promises":{lookup:()=>new Promise(()=>{})}});
  const pending=h.load("lib/whm-transport.ts").publicTarget("whm.example.net");
  assert.equal(timers[0].ms,3000);timers[0].fn();await assert.rejects(pending,e=>e.code==="timeout");assert.equal(timers[0].cleared,true);
  let calls=0;
  h=loader({setTimeout:set,clearTimeout:clear,"node:dns/promises":{lookup:async()=>[{address:"8.8.8.8",family:4}]},"node:https":{request(){calls++;const req=new EventEmitter();req.destroy=()=>req.emit("close");req.end=()=>timers.findLast(t=>t.ms===10000).fn();return req;}}});
  await assert.rejects(h.load("lib/whm-transport.ts").readWhm(HOST,{username:"root",token:TOKEN},"listaccts"),e=>e.code==="timeout");
  assert.equal(calls,1);assert.equal(timers.findLast(t=>t.ms===10000).cleared,true);
});
test("configuration GET and save are admin guarded before storage, save additionally requires Origin",async()=>{
  for(const scenario of ["unauth","bad-origin"]){
    let storage=0;
    const h=loader({"@/lib/auth":{requireAdmin:async()=>{if(scenario==="unauth")throw Error(TOKEN);}},"@/lib/whm":{whmConfiguration:async()=>{storage++;return {};},saveWhmConfiguration:async()=>{storage++;return {};}}});
    const route=h.load("app/api/admin/whm/settings/route.ts");
    const response=await route.POST(request({url:HOST,username:"root",token:TOKEN},"https://evil.example.net"));
    assert.equal(response.status,scenario==="unauth"?401:403);assert.equal(storage,0);
    if(scenario==="unauth"){const get=await route.GET(new NextRequest("https://app.example.net/api/admin/whm/settings"));assert.equal(get.status,401);assert.equal(storage,0);}
  }
});


test("safe error serialization ignores even a mutated typed error message/stack/cause",()=>{
  const w=loader().load("lib/whm-security.ts");const error=new w.WhmError("rejected");error.message=TOKEN;error.stack=TOKEN;error.cause={token:TOKEN};
  const safe=w.safeWhmError(error);assert.equal(safe.code,"rejected");assert.equal(JSON.stringify(safe).includes(TOKEN),false);
});
