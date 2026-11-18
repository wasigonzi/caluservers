/**
 * Genera un hash Argon2id para ADMIN_PASSWORD_HASH.
 *
 * Uso: npm run admin:hash
 * Salida: ADMIN_PASSWORD_HASH=<hash argon2id>
 *
 * Parámetros OWASP por defecto (memoria 19 MiB, t=2, p=1, salida 32 bytes),
 * ajustables con ARGON2_MEMORY_KIB / ARGON2_TIME / ARGON2_PARALLELISM.
 * La fuente de verdad de estos valores es lib/passwords.ts; si cambian
 * allí, cambia este script igual. El script es .mjs plano y no puede
 * importar el módulo TypeScript.
 */
import argon2 from "argon2";
import { createInterface } from "node:readline/promises";

function envInt(name, fallback, min) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw) || raw < min) return fallback;
  return raw;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pass = await rl.question("Admin password (input visible): ");
rl.close();
if (pass.length < 14) {
  console.error("Use at least 14 characters.");
  process.exit(1);
}
const hash = await argon2.hash(pass, {
  type: argon2.argon2id,
  memoryCost: envInt("ARGON2_MEMORY_KIB", 19456, 1024),
  timeCost: envInt("ARGON2_TIME", 2, 1),
  parallelism: envInt("ARGON2_PARALLELISM", 1, 1),
  hashLength: 32,
});
console.log("ADMIN_PASSWORD_HASH=" + hash);
