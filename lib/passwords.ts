/**
 * Contraseñas: Argon2id para todo lo nuevo, scrypt heredado solo para verificar.
 *
 * - Lo nuevo (admin en BD, clientes de better-auth) se guarda con Argon2id,
 *   parámetros OWASP por defecto: memoria 19 MiB, t=2, p=1, salida 32 bytes.
 *   Los parámetros se pueden ajustar con ARGON2_MEMORY_KIB / ARGON2_TIME /
 *   ARGON2_PARALLELISM, sin valores en .env.example (ver docs/SEGURIDAD-RBAC.md).
 * - Lo heredado tiene formato `<salt hex 32>:<digest hex 128>` y existe en
 *   DOS variantes de parámetros scrypt, porque se generó con dos librerías:
 *     · admin por entorno (scripts/hash-password.mjs antiguo y lib/auth.ts):
 *       defaults de Node, N=16384, r=8, p=1, 64 bytes.
 *     · clientes better-auth (@better-auth/utils/password):
 *       N=16384, r=16, p=1, 64 bytes.
 *   El formato no guarda los parámetros, así que la verificación prueba
 *   ambas variantes. Un hash scrypt válido se rehashea a Argon2id en el
 *   siguiente login correcto (rehash oportunista, ver lib/auth.ts).
 * - Cualquier otro formato devuelve false: nunca se lanza por un hash
 *   desconocido, porque better-auth espera un booleano en verify.
 */
import argon2 from "argon2";
import { scryptSync, timingSafeEqual } from "node:crypto";

export const ARGON2_DEFAULTS = {
  memoryKib: 19456,
  time: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

function envInt(name: string, fallback: number, min: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw) || raw < min) return fallback;
  return raw;
}

/** Parámetros Argon2id efectivos (env o defaults OWASP). */
export function argon2Params() {
  return {
    memoryKib: envInt("ARGON2_MEMORY_KIB", ARGON2_DEFAULTS.memoryKib, 1024),
    time: envInt("ARGON2_TIME", ARGON2_DEFAULTS.time, 1),
    parallelism: envInt("ARGON2_PARALLELISM", ARGON2_DEFAULTS.parallelism, 1),
    hashLength: ARGON2_DEFAULTS.hashLength,
  };
}

/** Formato estándar del paquete argon2: `$argon2id$v=19$m=...,t=...,p=...$...`. */
export function isArgon2idHash(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("$argon2id$");
}

const SCRYPT_RE = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;

/** Formato scrypt heredado `<salt hex 32>:<digest hex 128>`. */
export function isScryptHash(value: unknown): boolean {
  return typeof value === "string" && SCRYPT_RE.test(value);
}

/** Un hash heredado debe rehashearse a Argon2id en el próximo login correcto. */
export function needsRehash(value: unknown): boolean {
  return isScryptHash(value);
}

export async function hashPassword(password: string): Promise<string> {
  const params = argon2Params();
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: params.memoryKib,
    timeCost: params.time,
    parallelism: params.parallelism,
    hashLength: params.hashLength,
  });
}

function verifyScryptOnce(
  hash: string,
  password: string,
  r: number,
): boolean {
  const [salt, digest] = hash.split(":");
  const expected = Buffer.from(digest, "hex");
  // r=16 necesita 32 MiB exactos; el maxmem por defecto de Node lo rechaza.
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifyScrypt(hash: string, password: string): boolean {
  if (!isScryptHash(hash)) return false;
  try {
    // Primero la variante del admin por entorno (defaults de Node, r=8).
    if (verifyScryptOnce(hash, password, 8)) return true;
  } catch {
    // Sigue con la variante de better-auth; un fallo aquí es un "no".
  }
  try {
    // Variante de clientes better-auth (N=16384, r=16, p=1).
    return verifyScryptOnce(hash, password, 16);
  } catch {
    return false;
  }
}

/**
 * Verifica una contraseña contra un hash Argon2id o scrypt heredado.
 * Nunca lanza: formato desconocido, hash corrupto o contraseña incorrecta
 * devuelven false.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (typeof hash !== "string" || typeof password !== "string") return false;
  if (isArgon2idHash(hash)) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
  if (isScryptHash(hash)) return verifyScrypt(hash, password);
  return false;
}
