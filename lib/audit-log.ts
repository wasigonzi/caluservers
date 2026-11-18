import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { sanitizeAudit } from "./audit-sanitize";

/**
 * Auditoría unificada (Fase 6, frente B).
 *
 * `AuditLog` reúne lo que hoy escriben `AdminAudit` y `CommerceEvent`.
 * Esas tablas se conservan y sus escritores escriben TAMBIÉN aquí
 * (doble escritura, mejor esfuerzo): nada de lo viejo se borra ni se
 * deja de escribir. Si la escritura en `AuditLog` falla, el flujo que
 * la llamó sigue igual: estas funciones nunca lanzan.
 *
 * - La IP nunca se guarda en claro: solo su SHA-256 (`ipHash`).
 * - `details` pasa siempre por `sanitizeAudit`: nunca contraseñas,
 *   tokens ni secretos.
 */

export type AuditActorType = "admin" | "client" | "system";

export type AuditLogInput = {
  actorType: AuditActorType;
  /** Email del admin, id del cliente o identificador del sistema. */
  actorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /** IP en claro: se hashea aquí y nunca llega a la base. */
  ip?: string | null;
  userAgent?: string | null;
  details?: unknown;
};

/** SHA-256 hex de una IP. La IP en claro nunca se persiste. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Clasifica el `actor` que hoy guardan `AdminAudit`/`CommerceEvent`:
 * - "billing-cron", "domain-cron", "stripe", "paypal" y demás actores
 *   de sistema conocidos -> "system".
 * - Un actor con "@" es el correo de un admin -> "admin".
 * - Cualquier otro identificador (id de cliente) -> "client".
 * Es una heurística documentada para la doble escritura de eventos
 * antiguos, que no guardaban el tipo de actor; las llamadas nuevas
 * pasan `actorType` explícito.
 */
export function actorTypeFor(actor: string): AuditActorType {
  const value = (actor || "").trim().toLowerCase();
  if (
    value === "system" ||
    value === "stripe" ||
    value === "paypal" ||
    value === "billing-cron" ||
    value === "domain-cron" ||
    value.endsWith("-cron")
  ) {
    return "system";
  }
  if (value.includes("@")) return "admin";
  return "client";
}

type AuditLogData = {
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  details: string;
};

function toData(input: AuditLogInput): AuditLogData {
  return {
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    ipHash: input.ip ? hashIp(input.ip) : null,
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    details: sanitizeAudit(input.details ?? ""),
  };
}

/** Escribe una fila en `AuditLog`. Nunca lanza. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.auditLog.create({ data: toData(input) });
  } catch {
    // La auditoría no puede tumbar el flujo que la llamó.
  }
}

/**
 * Doble escritura dentro de una transacción de Prisma: la fila de
 * `AuditLog` se escribe con el mismo cliente transaccional (`tx`) que
 * la fila original, así que ambas se confirman o se revierten juntas.
 * Si el cliente no tiene `auditLog` (doble de pruebas sin esa tabla)
 * o la escritura falla, no hace nada y no lanza.
 */
export async function writeAuditLogTx(
  tx: { auditLog?: { create: (args: { data: AuditLogData }) => Promise<unknown> } },
  input: AuditLogInput,
): Promise<void> {
  try {
    if (!tx?.auditLog || typeof tx.auditLog.create !== "function") return;
    await tx.auditLog.create({ data: toData(input) });
  } catch {
    // La auditoría no puede tumbar la transacción que la llamó.
  }
}

/* ------------------------------ consulta ------------------------------ */

/** Tamaño de página de /admin/auditoria y de su API. */
export const AUDIT_LOG_PAGE_SIZE = 50;

export type AuditLogFilters = {
  actorType?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
};

const ACTOR_TYPES: ReadonlySet<string> = new Set(["admin", "client", "system"]);

/**
 * Filtro de `AuditLog` para la página y la API: lo comparten las dos, así
 * que un filtro se comporta igual en ambas. Valores inválidos se ignoran
 * (nunca rompen la consulta): `actorType` solo admite los tres tipos,
 * `from`/`to` son fechas `YYYY-MM-DD` y `to` cubre hasta el final del día.
 */
export function buildAuditLogWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorType && ACTOR_TYPES.has(filters.actorType)) {
    where.actorType = filters.actorType;
  }
  const action = (filters.action ?? "").trim().slice(0, 80);
  if (action) where.action = { contains: action, mode: "insensitive" };
  const resource = (filters.resource ?? "").trim().slice(0, 80);
  if (resource) {
    where.OR = [
      { resourceType: { contains: resource, mode: "insensitive" } },
      { resourceId: { contains: resource, mode: "insensitive" } },
    ];
  }
  const from = parseDay(filters.from, false);
  const to = parseDay(filters.to, true);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  return where;
}

function parseDay(raw: string | undefined, endOfDay: boolean): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
