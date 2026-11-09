import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { classifyDbError, reportDbError, safeDbUrlFlags } from "../lib/db-errors.ts";

const fixtureUrl = new URL("postgresql://HOST_CANARY.invalid:6543/DB_CANARY?sslmode=require&pgbouncer=true&token=TOKEN_CANARY");
fixtureUrl.username = "USER_CANARY";
fixtureUrl.password = "PASS_CANARY";
const url = fixtureUrl.href;
const secret = "PASSWORD_MESSAGE_CANARY";

describe("bounded safe DB diagnostics", () => {
  it("classifies only structured, allowlisted codes, never text in message/stack", () => {
    for (const code of ["P1001", "P1000", "P1013", "P2024", "42703", "42501"]) {
      assert.equal(classifyDbError({ code, message: "PageContent P2021 42P01 " + secret }).missingMigration, false);
    }
    for (const code of ["P2021", "42P01"]) {
      assert.equal(classifyDbError({ code }).missingMigration, true);
      assert.equal(classifyDbError({ code }).category, "missing_table");
    }
    assert.deepEqual(classifyDbError(new Error("PageContent P2021 42P01 " + secret)), { codes: [], category: "unknown", missingMigration: false });
    assert.deepEqual(classifyDbError({ code: "P9999", errorCode: "TOKEN_CANARY" }).codes, []);
  });

  it("supports initialization errorCode and structured nested SQLSTATE", () => {
    assert.deepEqual(classifyDbError({ errorCode: "P1001" }).codes, ["P1001"]);
    const result = classifyDbError({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "42P01", message: secret } } } });
    assert.equal(result.missingMigration, true);
    assert.equal(result.category, "missing_table");
    assert.deepEqual(result.codes, ["42P01", "P2010"]);
    assert.equal(classifyDbError({ cause: { sqlState: "28P01" } }).category, "authentication");
  });

  it("never serializes message/stack/cause, URL, username, password, tokens or payload", () => {
    const logs = [];
    const error = new Error(secret);
    error.code = "P1001";
    error.stack = "STACK_CANARY " + url;
    error.cause = { message: "CAUSE_CANARY", stack: url, payload: { secret } };
    error.meta = { password: secret, connectionString: url };
    reportDbError(error, url, (...args) => logs.push(args));
    assert.deepEqual(logs, [["cms_db_failure", { codes: ["P1001"], category: "unreachable", url: { present: true, postgresProtocol: true, sslmodePresent: true, pgbouncerPresent: true } }]]);
    const serialized = JSON.stringify(logs);
    for (const value of [secret, url, "STACK_CANARY", "CAUSE_CANARY", "USER_CANARY", "PASS_CANARY", "HOST_CANARY", "DB_CANARY", "TOKEN_CANARY"]) assert.ok(!serialized.includes(value));
    assert.equal(error.message, secret);
    assert.equal(error.cause.message, "CAUSE_CANARY");
  });

  it("ignores accessors/coercion and handles hostile, circular and oversized errors", () => {
    const error = {};
    for (const key of ["message", "stack", "cause", "code"]) Object.defineProperty(error, key, { get() { throw new Error(secret); } });
    assert.equal(classifyDbError(error).category, "unknown");
    const circular = { code: "P1001" }; circular.cause = circular;
    assert.deepEqual(classifyDbError(circular).codes, ["P1001"]);
    const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(secret); } });
    assert.equal(classifyDbError(proxy).category, "unknown");
    let deep = { code: "42P01" };
    for (let i = 0; i < 1000; i++) deep = { cause: deep };
    assert.equal(classifyDbError(deep).missingMigration, false);
    for (const value of [null, undefined, secret, 1, false]) assert.equal(classifyDbError(value).category, "unknown");
  });

  it("returns only URL booleans, including malformed/unset inputs", () => {
    assert.deepEqual(safeDbUrlFlags(undefined), { present: false, postgresProtocol: false, sslmodePresent: false, pgbouncerPresent: false });
    assert.deepEqual(safeDbUrlFlags("$file:/SECRET_CANARY"), { present: true, postgresProtocol: false, sslmodePresent: false, pgbouncerPresent: false });
    assert.equal(safeDbUrlFlags("not a url " + secret).postgresProtocol, false);
    assert.equal(safeDbUrlFlags("https://example.invalid").postgresProtocol, false);
    assert.equal(safeDbUrlFlags(url).postgresProtocol, true);
  });

  it("logging failure cannot replace an error and default logging is throttled", () => {
    assert.doesNotThrow(() => reportDbError({ code: "P1001" }, url, () => { throw new Error(secret); }));
    const original = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);
    try {
      reportDbError({ code: "P2034" }, undefined);
      reportDbError({ code: "P2034" }, undefined);
      assert.equal(logs.length, 1);
    } finally { console.error = original; }
  });
});

function cmsModule(error) {
  const logs = [];
  const original = { unchanged: "fallback" };
  const fail = async () => { throw error; };
  const db = {
    $transaction: async (ops) => {
      if (Array.isArray(ops)) {
        for (const op of ops) await op;
        return;
      }
      return ops(db);
    },
    siteSetting: { findFirst: fail },
    catalogConfig: { findFirst: fail },
    pageContent: { findMany: fail, findUnique: fail, findFirst: fail, upsert: fail },
    adminAudit: { findFirst: fail, create: fail },
    integrationConfig: { findFirst: fail },
  };
  const module = { exports: {} };
  const source = readFileSync(new URL("../lib/page-content-db.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, {
    module, exports: module.exports, process: { env: { DATABASE_URL: url } },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/db") return { db };
      if (name === "@/lib/db-errors") return { reportDbError: (e, value) => reportDbError(e, value, (...args) => logs.push(args)) };
      if (name === "@/lib/page-content") return { PAGE_PATHS: ["/"], PAGE_DEFS: [], defaultPayload: () => original, mergePagePayload: (_, payload) => payload ?? original, validatePagePayload: () => null };
      if (name === "@/lib/writes") return { commitPageContent: async () => { throw error; } };
      throw new Error("Unexpected test import");
    },
  });
  return { api: module.exports, logs, original };
}

describe("actual CMS DB readiness and error preservation", () => {
  it("marks migration missing only for explicit table codes and never exposes raw errors", async () => {
    for (const code of ["P2021", "42P01", "P1001", "P1000", "P1013", undefined]) {
      const error = Object.assign(new Error("PageContent " + secret + " " + url), { code, stack: "STACK_CANARY" });
      const { api, logs } = cmsModule(error);
      const result = await api.pageContentDbReady();
      assert.equal(result.ok, false);
      assert.equal(result.missingMigration, code === "P2021" || code === "42P01");
      assert.ok(!JSON.stringify([result, logs]).includes(secret));
      assert.ok(!JSON.stringify([result, logs]).includes(url));
    }
  });

  it("preserves public fallbacks and does not replace original write exceptions", async () => {
    const error = Object.assign(new Error(secret), { code: "P1001" });
    const { api, original, logs } = cmsModule(error);
    assert.equal(await api.getPageContent("/"), original);
    const all = await api.getAllPageContent();
    assert.equal(all["/"], original);
    await assert.rejects(() => api.savePageContent("/", { title: "test" }), (caught) => caught === error);
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes(secret));
  });
});
