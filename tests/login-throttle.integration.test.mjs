import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { LOGIN_MAX_FAILURES } from "../lib/login-rate-limit.ts";

const source = process.env.DATABASE_URL || "";
if (process.env.CI && !source) throw new Error("DATABASE_URL es obligatorio en CI");
const root = path.resolve(import.meta.dirname, "..");

function databaseUrl(name) {
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
}

test("el límite de login es atómico en Postgres y falla si la tabla no está", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const name = "caluservers_login_throttle";
  const url = databaseUrl(name);
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET = "e2e-auth-secret-not-for-production-use";
  const { consumeLoginAttempt, clearLoginThrottle, loginThrottleId } = await import("../lib/login-throttle-store.ts");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const key = "203.0.113.50";
    const results = await Promise.all(
      Array.from({ length: LOGIN_MAX_FAILURES + 4 }, () => consumeLoginAttempt(key)),
    );
    assert.equal(results.filter((item) => item.allowed).length, LOGIN_MAX_FAILURES);
    assert.equal(results.filter((item) => !item.allowed).length, 4);
    await clearLoginThrottle(key);
    const again = await consumeLoginAttempt(key);
    assert.equal(again.allowed, true);
    const id = loginThrottleId(key);
    await client.query(
      `UPDATE "LoginThrottle" SET failures = $1, "windowStart" = NOW() - interval '16 minutes' WHERE id = $2`,
      [LOGIN_MAX_FAILURES + 3, id],
    );
    const reset = await consumeLoginAttempt(key);
    assert.equal(reset.allowed, true);
    await client.query(`ALTER TABLE "LoginThrottle" RENAME TO "LoginThrottle_off"`);
    await assert.rejects(() => consumeLoginAttempt("otro"));
    await client.query(`ALTER TABLE "LoginThrottle_off" RENAME TO "LoginThrottle"`);
  } finally {
    await client.end();
    process.env.DATABASE_URL = source;
    const cleanup = new pg.Client({ connectionString: source });
    await cleanup.connect();
    await cleanup.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [name],
    );
    await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
    await cleanup.end();
  }
});
