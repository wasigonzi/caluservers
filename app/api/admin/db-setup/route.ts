import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMP admin-only DB diagnose (GET). Remove after pooler verification.
 * No apply / probe / arbitrary SQL. Prisma uses DATABASE_URL only (no directUrl in schema).
 */

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
      hasPassword: /:([^:@/\s]+)@/.test(raw),
      sslmode: null,
    };
  }
}

const EXPECTED_TABLES = ["SiteSetting", "CatalogConfig", "PageContent"] as const;

async function diagnose() {
  // Report env shape only — Prisma Client reads DATABASE_URL (schema has no directUrl).
  const databaseUrl = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  const directUrlMeta = sanitizeDatabaseUrl(process.env.DIRECT_URL);
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
    return {
      ok: true as const,
      reach: true,
      database: info?.db ?? null,
      user: info?.usr ?? null,
      version: String(info?.ver ?? "").split(",")[0] || null,
      tables: tables.map((t) => `${t.table_schema}.${t.table_name}`),
      expectedTables: expected,
      appliedMigrations,
      env: {
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrlMeta,
        prismaUses: "DATABASE_URL",
        schemaHasDirectUrl: false,
      },
      note: "TEMP GET diagnose only — quitar tras verificar pooler.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = msg.replace(/:[^:@/\s]+@/g, ":****@").slice(0, 280);
    return {
      ok: false as const,
      reach: false,
      error: safe,
      env: {
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrlMeta,
        prismaUses: "DATABASE_URL",
        schemaHasDirectUrl: false,
      },
      note: "BD no alcanzable desde este runtime — no es éxito.",
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
