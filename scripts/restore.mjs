/**
 * Restauración de un respaldo (Fase 6, frente C).
 *
 * Uso:
 *   node scripts/restore.mjs <respaldo.sql[.age]> [--dry-run]
 *   node scripts/restore.mjs <respaldo.sql.age> --target-db <DATABASE_URL> --confirm
 *
 * --dry-run es el modo por defecto: verifica el respaldo (existe, descifra
 * con BACKUP_AGE_PRIVATE_KEY si está cifrado con age, comprueba que el SQL
 * parece un pg_dump válido) SIN tocar ninguna base de datos.
 *
 * Con --target-db solo restaura a la base indicada y exige --confirm
 * explícito: sin él, se niega. La restauración con psql SOBRESCRIBE los
 * datos de la base destino: úsala contra una base vacía o de pruebas, nunca
 * a ciegas contra producción. Ver docs/RESPALDOS.md (restauración probada
 * trimestral).
 *
 * BACKUP_AGE_PRIVATE_KEY admite la clave en texto (AGE-SECRET-KEY-...) o
 * la ruta a un archivo de identidad age. La clave nunca se imprime.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fail(message) {
  console.error(`restore: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { file: null, dryRun: true, targetDb: null, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--target-db") {
      args.targetDb = argv[++i] ?? null;
      args.dryRun = false;
    } else if (arg === "--confirm") args.confirm = true;
    else if (arg === "--file") args.file = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log("Uso: node scripts/restore.mjs <respaldo.sql[.age]> [--dry-run]");
      console.log("     node scripts/restore.mjs <respaldo.sql.age> --target-db <DATABASE_URL> --confirm");
      process.exit(0);
    } else if (arg.startsWith("--")) fail(`Argumento no reconocido: ${arg}`);
    else if (!args.file) args.file = arg;
    else fail(`Argumento no reconocido: ${arg}`);
  }
  return args;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function commandExists(command) {
  try {
    await new Promise((resolve, reject) => {
      execFile(command, ["--version"], (error) => (error ? reject(error) : resolve()));
    });
    return true;
  } catch {
    return false;
  }
}

/** Resuelve la identidad age: texto de clave o ruta a archivo. Devuelve la ruta al archivo. */
function resolveAgeIdentity(workDir) {
  const raw = (process.env.BACKUP_AGE_PRIVATE_KEY || "").trim();
  if (!raw) return null;
  if (raw.startsWith("AGE-SECRET-KEY-")) {
    const path = join(workDir, "age-identity.txt");
    writeFileSync(path, `${raw}\n`, { mode: 0o600 });
    return path;
  }
  if (existsSync(raw)) return raw;
  fail("BACKUP_AGE_PRIVATE_KEY no es una clave AGE-SECRET-KEY- ni una ruta existente.");
  return null;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file) fail("Falta el archivo de respaldo. Uso: node scripts/restore.mjs <respaldo.sql[.age]> [--dry-run]");
if (!existsSync(args.file)) fail(`El respaldo no existe: ${args.file}`);
if (args.targetDb && !args.confirm) {
  fail("Restaurar exige --confirm explícito junto a --target-db. Sin él, no se toca ninguna base.");
}
if (args.targetDb && args.dryRun) {
  // --target-db ya desactiva el dry-run; esto solo cubre --dry-run explícito con --target-db.
  fail("Con --target-db no se puede usar --dry-run: quita --dry-run y añade --confirm si de verdad quieres restaurar.");
}

const workDir = mkdtempSync(join(tmpdir(), "caluservers-restore-"));
let sqlPath = args.file;
let encrypted = args.file.endsWith(".age");
try {
  if (encrypted) {
    if (!(await commandExists("age"))) {
      fail("El respaldo está cifrado con age pero `age` no está instalado en este equipo.");
    }
    const identity = resolveAgeIdentity(workDir);
    if (!identity) {
      fail("El respaldo está cifrado con age pero falta BACKUP_AGE_PRIVATE_KEY (clave o ruta al archivo de identidad).");
    }
    const plainPath = join(workDir, "backup.sql");
    const result = await run("age", ["--decrypt", "--identity", identity, "--output", plainPath, args.file]);
    if (result.code !== 0 || !existsSync(plainPath)) {
      fail(`age no pudo descifrar el respaldo (${(result.stderr || "").trim() || `código ${result.code}`}). Revisa la clave privada.`);
    }
    sqlPath = plainPath;
  }

  const content = readFileSync(sqlPath, "utf8");
  const looksLikeDump =
    content.includes("PostgreSQL database dump") &&
    (content.includes("CREATE TABLE") || content.includes("COPY ") || content.includes("SET "));
  console.log(`Respaldo: ${args.file} (${readFileSync(sqlPath).length} bytes, ${encrypted ? "cifrado con age (descifrado para verificar)" : "sin cifrar"}).`);
  if (!looksLikeDump) {
    fail("El archivo no parece un volcado de pg_dump válido (falta la cabecera «PostgreSQL database dump»). No se restaura nada.");
  }
  console.log("Verificación: el SQL parece un pg_dump válido.");

  if (args.dryRun) {
    console.log("--dry-run: no se tocó ninguna base de datos.");
    process.exit(0);
  }

  if (!(await commandExists("psql"))) {
    fail("`psql` no está instalado en este equipo. Instala PostgreSQL client tools y repite.");
  }
  console.log(`Restaurando en la base indicada con --target-db (psql, ON_ERROR_STOP=1)...`);
  const result = await run("psql", [args.targetDb, "-v", "ON_ERROR_STOP=1", "-f", sqlPath]);
  if (result.code !== 0) {
    fail(`psql falló (código ${result.code}): ${(result.stderr || "").trim().slice(0, 500) || "sin detalle"}. La base destino puede haber quedado a medias: revisa antes de reintentar.`);
  }
  console.log("Restauración completada.");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
