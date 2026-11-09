import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const source = process.env.DATABASE_URL || "";
const root = path.resolve(import.meta.dirname, "..");

test("sql aditivo sobre una base parcial conserva datos y cierra anon", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const name = "caluservers_partial_sql";
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const apply = await readFile(path.join(root, "prisma/manual/commerce-on-partial-db.sql"), "utf8");
  const rollback = await readFile(path.join(root, "prisma/manual/commerce-on-partial-db.rollback.sql"), "utf8");
  try {
    await client.query(`CREATE TABLE "SiteSetting" (key text PRIMARY KEY, value jsonb NOT NULL)`);
    await client.query(`INSERT INTO "SiteSetting" (key, value) VALUES ('keep', '{"ok":true}')`);
    await client.query(`CREATE TABLE "LoginThrottle" (
      id text PRIMARY KEY,
      failures integer NOT NULL,
      "windowStart" timestamp(3) NOT NULL,
      "updatedAt" timestamp(3) NOT NULL
    )`);
    await client.query(`INSERT INTO "LoginThrottle" (id, failures, "windowStart", "updatedAt")
      VALUES ('kept-throttle', 1, TIMESTAMP '2026-11-09 02:10:00', TIMESTAMP '2026-11-09 02:10:00')`);
    await client.query("GRANT SELECT ON TABLE \"LoginThrottle\" TO PUBLIC");
    await client.query(apply);
    await client.query(apply);
    const tables = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [[
      "user", "CustomerInvoice", "CustomerService", "SupportTicket", "CustomerOrder", "ManualPayment",
    ]]);
    assert.equal(tables.rowCount, 6);
    const kept = await client.query(`SELECT value->>'ok' AS ok FROM "SiteSetting" WHERE key = 'keep'`);
    assert.equal(kept.rows[0].ok, "true");
    const throttle = await client.query(`SELECT failures FROM "LoginThrottle" WHERE id = 'kept-throttle'`);
    assert.equal(throttle.rows[0].failures, 1);
    const rls = await client.query(`SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('user', 'LoginThrottle', 'CustomerInvoice')`);
    assert.equal(rls.rows.every((row) => row.relrowsecurity), true);
    const grants = await client.query(`SELECT grantee FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name IN ('LoginThrottle', 'user', 'CustomerInvoice')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')`);
    assert.equal(grants.rowCount, 0);
    const anon = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'anon'");
    if (anon.rowCount === 1) {
      await assert.rejects(async () => {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE anon");
        await client.query("SELECT id FROM \"LoginThrottle\"");
      }, (error) => error.code === "42501");
      await client.query("ROLLBACK");
    }
    await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES ('srv-1', 'Servidor', 'srv@example.com', true, now(), now())`);
    const visible = await client.query(`SELECT count(*)::int AS n FROM "user"`);
    assert.equal(visible.rows[0].n, 1);
    await client.query(rollback);
    const gone = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'CustomerInvoice'`);
    assert.equal(gone.rowCount, 0);
    const still = await client.query(`SELECT key FROM "SiteSetting"`);
    assert.equal(still.rows[0].key, "keep");
    const throttleLeft = await client.query(`SELECT id FROM "LoginThrottle"`);
    assert.equal(throttleLeft.rows[0].id, "kept-throttle");
  } finally {
    await client.end();
    const cleanup = new pg.Client({ connectionString: source });
    await cleanup.connect();
    await cleanup.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
    await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
    await cleanup.end();
  }
});
