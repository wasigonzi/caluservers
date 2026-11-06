import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { trustedWrite } from "@/lib/request";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Temporary admin-only DB probe + non-destructive schema apply. Remove after Supabase is healthy. */

type SafeUrlMeta = {
  present: boolean;
  scheme: string | null;
  host: string | null;
  port: string | null;
  user: string | null;
  dbName: string | null;
  hasPassword: boolean;
  sslmode: string | null;
};

function sanitizeDatabaseUrl(raw: string | undefined): SafeUrlMeta {
  if (!raw) {
    return {
      present: false,
      scheme: null,
      host: null,
      port: null,
      user: null,
      dbName: null,
      hasPassword: false,
      sslmode: null,
    };
  }
  try {
    const u = new URL(raw);
    return {
      present: true,
      scheme: u.protocol.replace(":", ""),
      host: u.hostname || null,
      port: u.port || null,
      user: decodeURIComponent(u.username || "") || null,
      dbName: (u.pathname || "/").replace(/^\//, "") || null,
      hasPassword: Boolean(u.password),
      sslmode: u.searchParams.get("sslmode"),
    };
  } catch {
    return {
      present: true,
      scheme: null,
      host: null,
      port: null,
      user: null,
      dbName: null,
      hasPassword: /:([^:@/]+)@/.test(raw),
      sslmode: null,
    };
  }
}

const EXPECTED_TABLES = ["SiteSetting", "CatalogConfig", "PageContent"] as const;

/** Exact Prisma migration DDL — CREATE only, IF NOT EXISTS for safe re-run. No DROP. */
const EMBEDDED_MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "20261106120000_site_settings",
    sql: `CREATE TABLE IF NOT EXISTS "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);`,
  },
  {
    name: "20261106140000_catalog_config",
    sql: `CREATE TABLE IF NOT EXISTS "CatalogConfig" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogConfig_pkey" PRIMARY KEY ("id")
);`,
  },
  {
    name: "20261106210000_page_content",
    sql: `CREATE TABLE IF NOT EXISTS "PageContent" (
    "path" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageContent_pkey" PRIMARY KEY ("path")
);`,
  },
];

async function ensureMigrationsTable() {
  await db.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`);
}

async function diagnose() {
  const databaseUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  const directUrl = sanitizeDatabaseUrl(process.env.DIRECT_URL);
  try {
    const rows = await db.$queryRawUnsafe<
      { db: string; usr: string; ver: string }[]
    >(
      `select current_database() as db, current_user as usr, version() as ver`,
    );
    const info = rows[0];
    const tables = await db.$queryRawUnsafe<
      { table_schema: string; table_name: string }[]
    >(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema not in ('pg_catalog','information_schema')
      order by table_schema, table_name
      limit 200`);
    const publicNames = tables
      .filter((t) => t.table_schema === "public")
      .map((t) => t.table_name);
    const expected = Object.fromEntries(
      EXPECTED_TABLES.map((n) => [n, publicNames.includes(n)]),
    );
    let appliedMigrations: string[] = [];
    if (publicNames.includes("_prisma_migrations")) {
      const migs = await db.$queryRawUnsafe<{ migration_name: string }[]>(
        `select migration_name from _prisma_migrations where finished_at is not null order by started_at`,
      );
      appliedMigrations = migs.map((m) => m.migration_name);
    }
    const rls = await db.$queryRawUnsafe<
      { relname: string; relrowsecurity: boolean }[]
    >(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname = any(array['SiteSetting','CatalogConfig','PageContent'])
      order by c.relname`);
    return {
      ok: true as const,
      reach: true,
      database: info?.db ?? null,
      user: info?.usr ?? null,
      version: String(info?.ver ?? "").split(",")[0] || null,
      tables: tables.map((t) => `${t.table_schema}.${t.table_name}`),
      expectedTables: expected,
      appliedMigrations,
      rls: Object.fromEntries(rls.map((r) => [r.relname, r.relrowsecurity])),
      env: { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
      note: "TEMP db-setup — no secrets returned. Remove after BD healthy.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = msg.replace(/:[^:@/\s]+@/g, ":****@").slice(0, 280);
    return {
      ok: false as const,
      reach: false,
      error: safe,
      env: { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
      note: "BD no alcanzable desde este runtime — no es éxito.",
    };
  }
}

async function applyMigrations() {
  const before = await diagnose();
  if (!before.ok) {
    return {
      ok: false as const,
      step: "diagnose",
      error: before.error,
      note: "No se aplicó migración: BD no alcanzable.",
    };
  }
  const applied: string[] = [];
  const skipped: string[] = [];
  await ensureMigrationsTable();
  for (const m of EMBEDDED_MIGRATIONS) {
    const exists = await db.$queryRawUnsafe<{ n: number }[]>(
      `select count(*)::int as n from _prisma_migrations where migration_name = $1 and finished_at is not null`,
      m.name,
    );
    // Always run IF NOT EXISTS DDL (idempotent); record migration if missing
    await db.$executeRawUnsafe(m.sql);
    if ((exists[0]?.n ?? 0) > 0) {
      skipped.push(m.name);
    } else {
      const id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `insert into _prisma_migrations
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         values ($1, $2, now(), $3, null, null, now(), 1)
         on conflict do nothing`,
        id,
        "embedded-if-not-exists",
        m.name,
      );
      applied.push(m.name);
    }
  }
  // Enable RLS (no policies → PostgREST anon blocked; Prisma owner bypasses unless FORCE)
  for (const t of EXPECTED_TABLES) {
    await db.$executeRawUnsafe(
      `ALTER TABLE IF EXISTS "${t}" ENABLE ROW LEVEL SECURITY`,
    );
  }
  const after = await diagnose();
  return {
    ok: after.ok && EXPECTED_TABLES.every((t) => after.expectedTables?.[t]),
    applied,
    skipped,
    after,
    note: after.ok
      ? "Migraciones CREATE IF NOT EXISTS aplicadas (sin DROP)."
      : "Migración intentada pero diagnóstico posterior falló.",
  };
}

async function writeProbe() {
  const path = `/__db_setup_probe_${Date.now()}`;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `insert into "PageContent" ("path","payload","updatedAt")
         values ($1, $2::jsonb, now())
         on conflict ("path") do update set "payload" = excluded."payload", "updatedAt" = now()`,
        path,
        JSON.stringify({ probe: true }),
      );
      const rows = await tx.$queryRawUnsafe<{ path: string }[]>(
        `select path from "PageContent" where path = $1`,
        path,
      );
      if (!rows.length) throw new Error("probe insert not visible");
      await tx.$executeRawUnsafe(
        `delete from "PageContent" where path = $1`,
        path,
      );
    });
    return {
      ok: true as const,
      note: "Escritura/borrado transaccional OK en PageContent.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false as const,
      error: msg.replace(/:[^:@/\s]+@/g, ":****@").slice(0, 280),
      note: "Probe de escritura falló — no es éxito.",
    };
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await diagnose();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!trustedWrite(req)) {
    return NextResponse.json(
      { error: "Forbidden — Origin debe coincidir con Host (CSRF)" },
      { status: 403 },
    );
  }
  let action = "apply";
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.action === "string") action = body.action;
  } catch {
    /* empty body ok */
  }

  if (action === "diagnose") {
    const result = await diagnose();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (action === "probe_write") {
    const diag = await diagnose();
    if (!diag.ok) {
      return NextResponse.json(
        { ok: false, error: diag.error, note: "Sin BD — probe no ejecutado." },
        { status: 503 },
      );
    }
    if (!diag.expectedTables?.PageContent) {
      return NextResponse.json(
        {
          ok: false,
          note: "Falta PageContent — aplica migraciones antes del probe.",
        },
        { status: 409 },
      );
    }
    const probe = await writeProbe();
    return NextResponse.json(probe, {
      status: probe.ok ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (action === "apply" || action === "apply_migrations") {
    const result = await applyMigrations();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.json(
    { error: "action inválida (diagnose|apply|probe_write)" },
    { status: 400 },
  );
}
