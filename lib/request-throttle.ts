import { createHmac } from "node:crypto";
import { db } from "./db";

/**
 * Límite de peticiones públicas compartido por todas las instancias.
 * El contador vive en Postgres (`RequestThrottle`), no en la memoria del proceso:
 * dos funciones serverless cuentan sobre la misma fila.
 *
 * Si la tabla o la base no responden, la llamada falla y la ruta pública debe
 * rechazar la petición. No existe un modo degradado sin límite.
 */

export type ThrottleScope = "contact" | "domain-lookup";

type Budget = { windowMs: number; max: number };

const BUDGETS: Record<ThrottleScope, Budget> = {
  // Un mensaje cada ~1,5 min sostenido; una ráfaga corta sigue pasando.
  contact: { windowMs: 30 * 60 * 1000, max: 20 },
  // La consulta sale a un servidor RDAP ajeno: se mantiene baja a propósito.
  "domain-lookup": { windowMs: 10 * 60 * 1000, max: 40 },
};

export function throttleBudget(scope: ThrottleScope): Budget {
  const budget = BUDGETS[scope];
  if (!budget) throw new Error("Unknown throttle scope");
  return budget;
}

/** La fila se identifica por un HMAC de ámbito + clave de cliente, nunca por la IP en claro. */
export function requestThrottleId(scope: ThrottleScope, rawKey: string): string {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) {
    throw Object.assign(new Error("AUTH_SECRET is missing"), {
      name: "RequestThrottleConfigError",
    });
  }
  throttleBudget(scope);
  return createHmac("sha256", secret).update(`${scope}:${rawKey}`).digest("hex");
}

export function throttleVerdict(
  scope: ThrottleScope,
  hits: number,
  windowStart: Date,
  now: number,
) {
  const { windowMs, max } = throttleBudget(scope);
  const elapsed = now - windowStart.getTime();
  if (!Number.isFinite(hits) || elapsed >= windowMs) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (hits > max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

type ThrottleRow = { hits: number; windowStart: Date };

/**
 * Cuenta un intento de forma atómica y devuelve si se permite.
 * Una sola sentencia: dos peticiones simultáneas no se pisan el contador.
 */
export async function consumeRequest(
  scope: ThrottleScope,
  rawKey: string,
  now = new Date(),
) {
  const id = requestThrottleId(scope, rawKey);
  const cutoff = new Date(now.getTime() - throttleBudget(scope).windowMs);
  const rows = await db.$queryRaw<ThrottleRow[]>`
    INSERT INTO "RequestThrottle" ("id", "hits", "windowStart", "updatedAt")
    VALUES (${id}, 1, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "hits" = CASE
        WHEN "RequestThrottle"."windowStart" <= ${cutoff} THEN 1
        ELSE "RequestThrottle"."hits" + 1
      END,
      "windowStart" = CASE
        WHEN "RequestThrottle"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "RequestThrottle"."windowStart"
      END,
      "updatedAt" = ${now}
    RETURNING "hits", "windowStart"
  `;
  const row = rows[0];
  if (!row) throw new Error("Request throttle did not return a row");
  return throttleVerdict(scope, Number(row.hits), new Date(row.windowStart), now.getTime());
}
