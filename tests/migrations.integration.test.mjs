import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const source = process.env.DATABASE_URL || "";
if (process.env.CI && !source) {
  throw new Error("DATABASE_URL es obligatorio en CI");
}

const root = path.resolve(import.meta.dirname, "..");
const previous = [
  "20261106120000_site_settings",
  "20261106140000_catalog_config",
  "20261106210000_page_content",
];

function databaseUrl(name) {
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
}

async function recreate(name) {
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
}

function migrate(url) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

async function tables(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  await client.end();
  return result.rows.map((row) => row.tablename);
}

test("instalación vacía y actualización de las 3 migraciones crean auditoría e integración", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const freshName = "caluservers_mig_fresh";
  const upgradeName = "caluservers_mig_upgrade";
  const freshUrl = databaseUrl(freshName);
  const upgradeUrl = databaseUrl(upgradeName);
  await recreate(freshName);
  await recreate(upgradeName);
  try {
    migrate(freshUrl);
    const freshTables = await tables(freshUrl);
    for (const name of ["AdminAudit", "IntegrationConfig", "SiteSetting", "CatalogConfig", "PageContent"]) {
      assert.ok(freshTables.includes(name), name);
    }

    const upgrade = new pg.Client({ connectionString: upgradeUrl });
    await upgrade.connect();
    for (const name of previous) {
      const sql = readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8");
      await upgrade.query(sql);
    }
    await upgrade.query(`
      CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    for (const name of previous) {
      const sql = readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"));
      await upgrade.query(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [randomUUID(), createHash("sha256").update(sql).digest("hex"), name],
      );
    }
    await upgrade.end();

    const before = await tables(upgradeUrl);
    assert.equal(before.includes("AdminAudit"), false);
    migrate(upgradeUrl);
    const after = await tables(upgradeUrl);
    assert.ok(after.includes("AdminAudit"));
    assert.ok(after.includes("IntegrationConfig"));
  } finally {
    await recreate(freshName).catch(() => {});
    await recreate(upgradeName).catch(() => {});
    const admin = new pg.Client({ connectionString: source });
    await admin.connect();
    for (const name of [freshName, upgradeName]) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [name],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    }
    await admin.end();
  }
});

test("si falla la auditoría no se publica el ajuste", {
  skip: source ? false : "DATABASE_URL no está definido",
}, async () => {
  const name = "caluservers_mig_atomic";
  const url = databaseUrl(name);
  await recreate(name);
  const client = new pg.Client({ connectionString: url });
  try {
    migrate(url);
    process.env.DATABASE_URL = url;
    const { commitSiteSettings } = await import("../lib/writes.ts");
    const { DEFAULT_SITE_SETTINGS } = await import("../lib/site-settings.ts");
    const before = structuredClone(DEFAULT_SITE_SETTINGS);
    before.networkStatus = "ANTES_DE_AUDIT";
    await commitSiteSettings(before);
    await client.connect();
    await client.query(`
      CREATE OR REPLACE FUNCTION calu_audit_fail() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit blocked';
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER calu_audit_block BEFORE INSERT ON "AdminAudit"
      FOR EACH ROW EXECUTE FUNCTION calu_audit_fail();
    `);
    const after = structuredClone(before);
    after.networkStatus = "NO_DEBE_PUBLICARSE";
    await assert.rejects(() => commitSiteSettings(after));
    const stored = await client.query(
      `SELECT value::text AS value FROM "SiteSetting" WHERE key = 'network_status'`,
    );
    assert.match(stored.rows[0].value, /ANTES_DE_AUDIT/);
    assert.equal(stored.rows[0].value.includes("NO_DEBE_PUBLICARSE"), false);
    await client.query(`DROP TRIGGER calu_audit_block ON "AdminAudit"`);
    await commitSiteSettings(after);
    const published = await client.query(
      `SELECT value::text AS value FROM "SiteSetting" WHERE key = 'network_status'`,
    );
    assert.match(published.rows[0].value, /NO_DEBE_PUBLICARSE/);
  } finally {
    await client.end().catch(() => {});
    process.env.DATABASE_URL = source;
    const admin = new pg.Client({ connectionString: source });
    await admin.connect();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
});
