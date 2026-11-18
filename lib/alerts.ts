import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { sanitizeAudit } from "./audit-sanitize";
import { deliverNotice, mailerConfigured } from "./mailer";

/**
 * Alertas (Fase 6, frente B).
 *
 * Una alerta solo se crea si su `AlertRule` existe y está activa; sin
 * regla o con la regla inactiva, `raiseAlert` no hace nada (y lo dice
 * en el resultado). El correo solo sale si hay SMTP configurado
 * (`mailerConfigured`): sin SMTP la alerta vive solo en el panel
 * (/admin/alertas). Ninguna de estas funciones lanza nunca: un fallo
 * de base o de correo no puede tumbar el flujo que disparó la alerta.
 *
 * El cuerpo de una alerta por correo NUNCA lleva datos sensibles: el
 * título y el cuerpo pasan por `sanitizeAudit` antes de guardarse y
 * antes de enviarse (sin contraseñas, tokens, IPs en claro ni secretos).
 */

export type AlertSeverity = "info" | "warning" | "critical";

export type RaiseAlertInput = {
  /** Clave de la regla sembrada (p. ej. "admin.critical_action"). */
  ruleKey: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /**
   * Dedupe: si ya existe una alerta con la misma regla y recurso en las
   * últimas `dedupeHours` horas, no se crea otra. Sin este campo no hay
   * dedupe (cada disparo crea su alerta).
   */
  dedupeHours?: number;
};

export type RaiseAlertResult = {
  created: boolean;
  reason: "created" | "no-rule" | "rule-inactive" | "duplicate" | "error";
  /** Cierto solo si el correo salió (SMTP configurado y aceptado). */
  emailed?: boolean;
};

/** Cierto si ya hay una alerta reciente con esa regla y recurso. */
export async function hasRecentAlert(
  ruleKey: string,
  resourceId: string,
  hours: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - hours * 3600_000);
    const found = await db.alert.findFirst({
      where: { ruleKey, resourceId, createdAt: { gte: since } },
    });
    return Boolean(found);
  } catch {
    return false;
  }
}

export async function raiseAlert(input: RaiseAlertInput): Promise<RaiseAlertResult> {
  // Saneado ANTES de guardar y de enviar: ni el título ni el cuerpo
  // pueden llevar contraseñas, tokens, IPs en claro ni secretos.
  const title = sanitizeAudit(input.title);
  const body = sanitizeAudit(input.body);
  try {
    const rule = await db.alertRule.findUnique({ where: { key: input.ruleKey } });
    if (!rule) return { created: false, reason: "no-rule" };
    if (!rule.active) return { created: false, reason: "rule-inactive" };
    if (input.dedupeHours && input.resourceId) {
      if (await hasRecentAlert(input.ruleKey, input.resourceId, input.dedupeHours)) {
        return { created: false, reason: "duplicate" };
      }
    }
    await db.alert.create({
      data: {
        ruleKey: input.ruleKey,
        severity: input.severity,
        title,
        body,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
      },
    });
  } catch {
    return { created: false, reason: "error" };
  }
  // Correo (mejor esfuerzo, solo con SMTP): sin SMTP la alerta queda
  // solo en el panel. El destinatario es el correo del admin propietario
  // (ADMIN_EMAIL); sin él no hay a quién escribir.
  let emailed = false;
  try {
    const smtpReady =
      typeof mailerConfigured === "function" ? mailerConfigured() : false;
    const to = (process.env.ADMIN_EMAIL || "").trim();
    if (smtpReady && to) {
      const result = await deliverNotice({
        to,
        subject: `[Alerta CaluServers] ${title}`,
        text: [
          `Severidad: ${input.severity}`,
          `Regla: ${input.ruleKey}`,
          "",
          body,
          ...(input.resourceType || input.resourceId
            ? [`Recurso: ${[input.resourceType, input.resourceId].filter(Boolean).join(" ")}`]
            : []),
          "",
          "Revisala en el panel: /admin/alertas",
        ].join("\n"),
      });
      emailed = result.delivered;
    }
  } catch {
    emailed = false;
  }
  return { created: true, reason: "created", emailed };
}

/* ------------------------------ disparadores ------------------------------ */

/**
 * Login de admin sospechoso: solo si hay historial previo de `ipHash`
 * en `AdminSession` para ese admin y la IP actual (hasheada, nunca en
 * claro) es distinta a todas las conocidas. Sin historial no se alerta:
 * el primer inicio desde una IP no es sospechoso por sí solo. No se
 * usa geolocalización: solo la comparación de hashes.
 *
 * `adminUserId` es null para las sesiones del fallback por entorno
 * (sin AdminUser en BD); en ese caso el historial son las sesiones
 * con `adminUserId` null. La IP "local" (sin cabecera de IP real) no
 * se compara: no es una IP.
 */
export async function checkSuspiciousAdminLogin(input: {
  adminUserId: string | null;
  email: string;
  ip: string;
}): Promise<boolean> {
  try {
    const ip = (input.ip || "").trim();
    if (!ip || ip === "local") return false;
    const ipHash = createHash("sha256").update(ip).digest("hex");
    const sessions = await db.adminSession.findMany({
      where: { adminUserId: input.adminUserId, revokedAt: null },
      select: { ipHash: true },
    });
    const known = new Set(
      (sessions ?? []).map((row) => row.ipHash).filter((value): value is string => Boolean(value)),
    );
    if (known.size === 0) return false;
    if (known.has(ipHash)) return false;
    const result = await raiseAlert({
      ruleKey: "admin.login_suspicious",
      severity: "warning",
      title: `Inicio de sesión de ${input.email} desde una IP nueva`,
      body: `La cuenta ${input.email} inició sesión desde una dirección IP distinta a las usadas antes. Si no fuiste tú, revisa las sesiones en /admin/seguridad y cambia la contraseña.`,
      resourceType: "adminUser",
      resourceId: input.adminUserId ?? undefined,
    });
    return result.created;
  } catch {
    return false;
  }
}

/** Umbral de consumo anormal: facturas de renovación impagas seguidas. */
export const ABNORMAL_USAGE_FAILED_INVOICES = 3;

/**
 * Consumo anormal: un servicio con 3 o más facturas de renovación
 * vencidas sin cobrar seguidas (las 3 más recientes de su suscripción
 * están en estado "issued" y vencidas). Se evalúa tras un cobro
 * fallido de renovación en `lib/billing-cron.ts`. Dedupe de 24 h por
 * servicio: no se repite la misma alerta cada día para el mismo
 * servicio. Devuelve true solo si se creó la alerta.
 */
export async function maybeAlertAbnormalUsage(input: {
  serviceId: string;
  subscriptionId: string;
  now?: Date;
}): Promise<boolean> {
  try {
    if (!input.serviceId || !input.subscriptionId) return false;
    const now = input.now ?? new Date();
    const invoices = await db.customerInvoice.findMany({
      where: { subscriptionId: input.subscriptionId },
      orderBy: { dueDate: "desc" },
      take: ABNORMAL_USAGE_FAILED_INVOICES,
    });
    const failed = (invoices ?? []).filter(
      (invoice) =>
        invoice.status === "issued" &&
        invoice.dueDate &&
        invoice.dueDate.getTime() <= now.getTime(),
    );
    if (failed.length < ABNORMAL_USAGE_FAILED_INVOICES) return false;
    const result = await raiseAlert({
      ruleKey: "billing.abnormal_usage",
      severity: "warning",
      title: `Consumo anormal: ${failed.length} facturas impagas seguidas`,
      body: `El servicio ${input.serviceId} acumula ${failed.length} facturas de renovación vencidas sin cobrar. Revisa el cobro y el dunning antes de que se suspenda.`,
      resourceType: "service",
      resourceId: input.serviceId,
      dedupeHours: 24,
    });
    return result.created;
  } catch {
    return false;
  }
}
