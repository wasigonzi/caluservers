// Aplica las migraciones pendientes al desplegar en producción.
//
// Solo corre con VERCEL_ENV=production: una vista previa de una rama nunca toca
// el esquema. Las migraciones del repo son aditivas (crean tablas y columnas).
//
// Si no se pueden aplicar, el despliegue NO se detiene: la web sigue saliendo y
// el panel avisa en Configuración → Base de datos de qué falta.
//
// Un pooler en modo transacción no sirve para migrar. Si DATABASE_URL apunta al
// pooler de Supabase en el puerto 6543, se usa el mismo pooler en modo sesión
// (puerto 5432, mismas credenciales). Después se prueban DATABASE_URL y DIRECT_URL.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TIMEOUT_MS = 75_000;

/** Variante en modo sesión del pooler de Supabase, o null si la URL no es de ese tipo. */
export function sessionPoolerUrl(raw) {
  try {
    const url = new URL(raw);
    if (!/^postgres(ql)?:$/.test(url.protocol)) return null;
    if (!url.hostname.endsWith(".pooler.supabase.com") || url.port !== "6543") return null;
    url.port = "5432";
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    return url.toString();
  } catch {
    return null;
  }
}

function isPostgresUrl(value) {
  return typeof value === "string" && /^postgres(ql)?:\/\//.test(value.trim());
}

function prisma(args, url) {
  const result = spawnSync("npx", ["prisma", ...args], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return { ok: result.status === 0, out: `${result.stdout || ""}\n${result.stderr || ""}`, error: result.error };
}

/** Del resultado de Prisma solo se muestran las líneas de estado; nunca imprime la contraseña. */
function report(out) {
  const lines = out
    .split("\n")
    .filter((line) => /migration|applied|pending|error|P\d{4}|Datasource/i.test(line))
    .slice(0, 30);
  for (const line of lines) console.log(`[migraciones] ${line.trim()}`);
}

const ADDITIVE = [/^CREATE TABLE "/, /^CREATE (UNIQUE )?INDEX "/];
const ADD_CLAUSE = /^ADD (COLUMN|CONSTRAINT) /;
const FORBIDDEN = /\b(DROP|RENAME|DELETE|TRUNCATE|UPDATE|INSERT|GRANT|REVOKE)\b|ALTER COLUMN/;

/**
 * De un guion de `prisma migrate diff` se queda solo con lo que añade: crear
 * tablas e índices, y las cláusulas ADD COLUMN / ADD CONSTRAINT de cada ALTER TABLE.
 * Todo lo demás (cambios de tipo, borrados, renombrados) se descarta y se cuenta:
 * nunca se ejecuta. Una base creada a mano suele diferir en tipos de fecha; eso
 * no impide que la aplicación funcione y no se toca.
 */
export function additivePlan(sql) {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const apply = [];
  const skipped = [];
  for (const statement of statements) {
    const alter = statement.match(/^(ALTER TABLE "[^"]+") ([\s\S]+)$/);
    if (alter) {
      const clauses = alter[2].split(/,\s*\n/).map((clause) => clause.trim());
      const kept = clauses.filter((clause) => ADD_CLAUSE.test(clause) && !FORBIDDEN.test(clause));
      for (const clause of clauses) if (!kept.includes(clause)) skipped.push(`${alter[1]} ${clause}`);
      if (kept.length) apply.push(`${alter[1]} ${kept.join(",\n")}`);
      continue;
    }
    if (ADDITIVE.some((pattern) => pattern.test(statement)) && !FORBIDDEN.test(statement)) {
      apply.push(statement);
    } else {
      skipped.push(statement);
    }
  }
  return { apply, skipped };
}

/**
 * Base con tablas pero sin historial de Prisma (P3005): se creó a mano o con `db push`.
 * Se calcula qué le falta respecto al esquema y se aplica solo lo que añade, sentencia
 * a sentencia. El historial se registra únicamente si la base queda idéntica al esquema;
 * si quedan diferencias, cada despliegue repite esta comprobación, que es inocua.
 */
function adoptExistingDatabase(url) {
  console.log("[migraciones] la base no tiene historial de Prisma: se calcula qué le falta.");
  const diff = prisma(
    ["migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    url,
  );
  if (!diff.ok) {
    report(diff.out);
    return false;
  }
  const plan = additivePlan(diff.out.split("\n").filter((line) => !/^npm warn|^warn /i.test(line)).join("\n"));
  if (plan.skipped.length) {
    console.log(
      `[migraciones] ${plan.skipped.length} diferencias que no son altas se dejan como están (tipos de columna, tablas ajenas).`,
    );
  }
  const dir = mkdtempSync(path.join(tmpdir(), "migrar-"));
  let failed = 0;
  plan.apply.forEach((statement, index) => {
    const file = path.join(dir, `${index}.sql`);
    writeFileSync(file, `${statement};\n`);
    const applied = prisma(["db", "execute", "--url", url, "--file", file], url);
    const what = statement.split("\n")[0].slice(0, 80);
    if (applied.ok) {
      console.log(`[migraciones] aplicado: ${what}`);
    } else {
      failed += 1;
      console.log(`[migraciones] NO aplicado: ${what}`);
      report(applied.out);
    }
  });
  if (!plan.apply.length) console.log("[migraciones] no hay nada que añadir.");
  if (failed) return false;
  if (plan.skipped.length) {
    console.log("[migraciones] lo que faltaba está añadido. No se registra historial porque la base no es idéntica al esquema.");
    return true;
  }
  const names = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    const resolved = prisma(["migrate", "resolve", "--applied", name], url);
    if (!resolved.ok) {
      report(resolved.out);
      return false;
    }
  }
  console.log(`[migraciones] historial registrado: ${names.length} migraciones.`);
  return true;
}

function migrate(label, url) {
  console.log(`[migraciones] aplicando con ${label}…`);
  const result = prisma(["migrate", "deploy"], url);
  report(result.out);
  if (result.error) console.log(`[migraciones] ${label}: ${result.error.code || "fallo al ejecutar"}`);
  if (result.ok) return true;
  if (/P3005/.test(result.out)) return adoptExistingDatabase(url);
  return false;
}

function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("[migraciones] no es un despliegue de producción: no se toca el esquema.");
    process.exit(0);
  }

  const candidates = [
    ["el pooler en modo sesión", sessionPoolerUrl(process.env.DATABASE_URL || "")],
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
  ].filter(([label, url]) => {
    if (isPostgresUrl(url)) return true;
    if (url) console.log(`[migraciones] ${label} no es una URL de Postgres válida: se omite.`);
    return false;
  });

  if (candidates[0]?.[0] === "el pooler en modo sesión") {
    const index = candidates.findIndex(([label]) => label === "DATABASE_URL");
    if (index > 0) candidates.splice(index, 1);
  }

  if (!candidates.length) {
    console.log("[migraciones] AVISO: no hay DATABASE_URL. No se aplicó nada.");
    process.exit(0);
  }

  for (const [label, url] of candidates) {
    if (migrate(label, url)) {
      console.log("[migraciones] esquema al día.");
      process.exit(0);
    }
  }
  console.log(
    "[migraciones] AVISO: no se pudieron aplicar las migraciones. La web se despliega igual; " +
      "revisa Configuración → Base de datos en el panel y ejecuta «npx prisma migrate deploy» a mano.",
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
