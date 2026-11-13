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

function migrate(label, url) {
  console.log(`[migraciones] aplicando con ${label}…`);
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  // Prisma no imprime la contraseña; aun así solo se muestran las líneas útiles.
  const lines = `${result.stdout || ""}\n${result.stderr || ""}`
    .split("\n")
    .filter((line) => /migration|applied|pending|error|P\d{4}|Datasource/i.test(line))
    .slice(0, 30);
  for (const line of lines) console.log(`[migraciones] ${line.trim()}`);
  if (result.error) console.log(`[migraciones] ${label}: ${result.error.code || "fallo al ejecutar"}`);
  return result.status === 0;
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
