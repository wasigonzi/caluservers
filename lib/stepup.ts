import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { AdminSessionInfo } from "@/lib/auth";

/**
 * Step-up (Fase 6, frente C): reautenticación para operaciones peligrosas.
 *
 * `AdminSession.stepUpAt` guarda cuándo el admin confirmó su identidad por
 * última vez (contraseña + TOTP si lo tiene enrolado, vía
 * `POST /api/admin/step-up`). Las rutas peligrosas exigen que esa
 * confirmación sea reciente; si no, responden 403 con el código
 * `step-up-required` y la UI muestra el formulario de reautenticación.
 *
 * Caducidad por defecto: 15 minutos (el plan decía 10; se deja en 15
 * porque el flujo de confirmación + revisión de la operación ya es
 * estrecho, y el dueño puede pedir que se baje).
 */
export const STEP_UP_MAX_AGE_MINUTES = 15;
export const STEP_UP_ERROR_CODE = "step-up-required";
export const STEP_UP_MESSAGE =
  "Esta operación exige confirmar tu identidad de nuevo: tu última confirmación caducó o no existe. Vuelve a escribir tu contraseña.";

export class StepUpRequiredError extends Error {
  readonly status = 403;
  readonly code = "step-up-required";
  constructor() {
    super(STEP_UP_MESSAGE);
    this.name = "StepUpRequiredError";
  }
}

/** true si `stepUpAt` existe y tiene menos de `maxAgeMinutes`. Puro. */
export function isStepUpFresh(
  stepUpAt: Date | string | null | undefined,
  maxAgeMinutes: number = STEP_UP_MAX_AGE_MINUTES,
  nowMs: number = Date.now(),
): boolean {
  if (!stepUpAt) return false;
  const when = stepUpAt instanceof Date ? stepUpAt.getTime() : new Date(stepUpAt).getTime();
  if (!Number.isFinite(when)) return false;
  return nowMs - when >= 0 && nowMs - when <= maxAgeMinutes * 60 * 1000;
}

/**
 * Exige un step-up reciente en la sesión. Lanza `StepUpRequiredError`
 * (status 403, código `step-up-required`) si `session.stepUpAt` es nulo
 * o tiene más de `maxAgeMinutes`. Devuelve la sesión si pasa.
 */
export function requireStepUp(
  session: Pick<AdminSessionInfo, "stepUpAt"> | null | undefined,
  opts?: { maxAgeMinutes?: number; nowMs?: number },
): AdminSessionInfo {
  if (!isStepUpFresh(session?.stepUpAt, opts?.maxAgeMinutes, opts?.nowMs)) {
    throw new StepUpRequiredError();
  }
  return session as AdminSessionInfo;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash SHA-256 del token de sesión en claro (igual que `lib/auth.ts`). */
export function hashSessionToken(token: string): string {
  return sha256(token);
}

/**
 * Marca `stepUpAt = now` en la sesión actual. Se identifica por el hash
 * del token de la cookie (`tokenHash`) o por `adminUserId` (todas sus
 * sesiones vivas y no revocadas). Devuelve true si marcó al menos una.
 * Las sesiones del fallback por entorno no tienen `adminUserId`: para
 * ellas hay que pasar `tokenHash`.
 */
export async function touchStepUp(opts: {
  adminUserId?: string;
  tokenHash?: string;
}): Promise<boolean> {
  const where: { adminUserId?: string; tokenHash?: string; revokedAt: null; expiresAt: { gt: Date } } = {
    revokedAt: null,
    expiresAt: { gt: new Date() },
  };
  if (opts.tokenHash) where.tokenHash = opts.tokenHash;
  else if (opts.adminUserId) where.adminUserId = opts.adminUserId;
  else return false;
  const updated = await db.adminSession.updateMany({
    where,
    data: { stepUpAt: new Date() },
  });
  return updated.count > 0;
}
