// Aplica las migraciones pendientes al desplegar en producción.
//
// Solo corre con VERCEL_ENV=production: una vista previa de una rama nunca toca
// el esquema. Las migraciones del repo son aditivas (crean tablas y columnas).
//
// Si no se pueden aplicar, el despliegue NO se detiene: la web sigue saliendo y
// el panel avisa en Configuración → Base de datos de qué falta. Se prueba primero
// con DATABASE_URL y, si falla, con DIRECT_URL (un pooler en modo transacción no
// sirve para migrar).
import { spawnSync } from "node:child_process";

const TIMEOUT_MS = 120_000;

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

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migraciones] no es un despliegue de producción: no se toca el esquema.");
  process.exit(0);
}

const candidates = [
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["DIRECT_URL", process.env.DIRECT_URL],
].filter(([, url]) => typeof url === "string" && url.trim());

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
