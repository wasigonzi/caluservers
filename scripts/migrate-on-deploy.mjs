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

const ADDITIVE = [
  /^CREATE TABLE "/,
  /^CREATE (UNIQUE )?INDEX "/,
  /^ALTER TABLE "[^"]+" ADD (COLUMN|CONSTRAINT) /,
];
const FORBIDDEN = /\b(DROP|RENAME|DELETE|TRUNCATE|UPDATE|INSERT|GRANT|REVOKE)\b|ALTER COLUMN/;

/**
 * Separa un guion de `prisma migrate diff` en lo que se puede aplicar sin riesgo.
 * Solo se acepta crear tablas, índices, columnas y restricciones. Borrar una tabla
 * que el esquema no conoce se ignora (se deja como está); cualquier otra cosa lo rechaza todo.
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
    if (/^DROP TABLE "[^"]+"$/.test(statement)) {
      skipped.push(statement);
      continue;
    }
    // Cada cláusula de un ALTER TABLE con varias debe ser un ADD.
    const clauses = statement.startsWith("ALTER TABLE")
      ? statement.split(/,\n/).slice(1)
      : [];
    const safe =
      ADDITIVE.some((pattern) => pattern.test(statement)) &&
      !FORBIDDEN.test(statement) &&
      clauses.every((clause) => /^\s*ADD (COLUMN|CONSTRAINT) /.test(clause));
    if (!safe) return { ok: false, apply: [], skipped, rejected: statement.slice(0, 70) };
    apply.push(statement);
  }
  return { ok: true, apply, skipped, rejected: "" };
}

/**
 * Base con tablas pero sin historial de Prisma (P3005): se creó a mano o con `db push`.
 * Se calcula qué le falta respecto al esquema, se aplica solo si es aditivo y se
 * registra el historial para que los próximos despliegues migren con normalidad.
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
  if (!plan.ok) {
    console.log(`[migraciones] el cambio necesario no es solo añadir. No se aplica nada. Empieza por: ${plan.rejected}`);
    return false;
  }
  for (const statement of plan.skipped) {
    console.log(`[migraciones] se deja intacta una tabla ajena al esquema: ${statement.replace("DROP TABLE ", "")}`);
  }
  if (plan.apply.length) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "migrar-")), "faltante.sql");
    writeFileSync(file, `BEGIN;\n${plan.apply.join(";\n")};\nCOMMIT;\n`);
    const applied = prisma(["db", "execute", "--url", url, "--file", file], url);
    if (!applied.ok) {
      report(applied.out);
      console.log("[migraciones] no se pudo aplicar lo que faltaba; la base queda como estaba.");
      return false;
    }
    console.log(`[migraciones] aplicadas ${plan.apply.length} sentencias (tablas, columnas e índices que faltaban).`);
  } else {
    console.log("[migraciones] al esquema no le falta nada.");
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
