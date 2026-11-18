import "server-only";
import { timingSafeEqual } from "node:crypto";
import { sanitizeAudit } from "./audit-sanitize";
import { writeAuditLog } from "./audit-log";
import { maybeAlertAbnormalUsage } from "./alerts";
import {
  advanceSubscriptionAfterPayment,
  createRenewalInvoice,
} from "./billing-recurring";
import { CommerceError, recordGatewayPayment } from "./commerce";
import { db } from "./db";
import { deliverNotice } from "./mailer";
import { chargeStripeSubscriptionInvoice } from "./stripe";
import { suspendServicePanel, terminateServicePanel } from "./panels";

/**
 * Cron de facturación recurrente (Fase 2, frente C).
 *
 * - runBillingCron: emite las facturas de renovación vencidas (lotes de 50),
 *   intenta el cobro automático y aplica el dunning por etapas a las
 *   facturas de renovación impagas ya vencidas.
 * - runRemindersCron: avisa de las facturas impagas que vencen en 7, 3 o 1
 *   días, un recordatorio por factura y umbral. Los dominios no entran
 *   (eso es Fase 3).
 * - Cada paso deja un CommerceEvent auditable (billing.run, billing.reminder,
 *   billing.dunning, billing.renewal_created, billing.charge_failed) visible
 *   en /admin/actividad.
 * - Las plantillas de correo son texto en código por ahora; las plantillas
 *   editables llegan en Fase 5.
 */

export type CronStats = {
  processed: number;
  succeeded: number;
  failed: number;
  details: string[];
};

function emptyStats(): CronStats {
  return { processed: 0, succeeded: 0, failed: 0, details: [] };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return Object.getOwnPropertyDescriptor(error, "code")?.value === "P2002";
}

/* ------------------------------ autorización ------------------------------ */

/** Cierto solo si el secreto del cron está configurado. */
export function cronSecretConfigured(): boolean {
  return Boolean((process.env.CRON_SECRET || "").trim());
}

function timingSafeEqualToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Exige `Authorization: Bearer <CRON_SECRET>`. Sin CRON_SECRET configurado
 * responde 503 honesto (el cron no está listo); sin cabecera o con una
 * incorrecta, 401. Nunca expone el secreto.
 */
export function authorizeCronRequest(headers: {
  get(name: string): string | null;
}): void {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) {
    throw new CommerceError("El cron no está configurado: falta CRON_SECRET.", 503);
  }
  const header = headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  if (!token || !timingSafeEqualToken(token, secret)) {
    throw new CommerceError("No autorizado.", 401);
  }
}

/* ------------------------------ corrida (BillingRun) ------------------------------ */

/** Día de la corrida, YYYY-MM-DD en UTC. */
export function runDayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Reclama la corrida del día para un tipo (`kind`). Si ya existe una
 * corrida de hoy, la devuelve con `alreadyRan: true` y quien llama NO
 * re-ejecuta nada: un reintento del cron no duplica facturas ni avisos.
 */
export async function claimBillingRun(kind: string, runDay: string) {
  try {
    const run = await db.billingRun.create({ data: { kind, runDay } });
    return { run, alreadyRan: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const run = await db.billingRun.findUnique({
        where: { kind_runDay: { kind, runDay } },
      });
      if (run) return { run, alreadyRan: true };
    }
    throw error;
  }
}

/** Cierra la corrida con los contadores finales. */
export async function finishBillingRun(
  runId: string,
  stats: CronStats,
  details?: string,
) {
  return db.billingRun.update({
    where: { id: runId },
    data: {
      processed: stats.processed,
      succeeded: stats.succeeded,
      failed: stats.failed,
      ...(details ? { details } : {}),
    },
  });
}

/* ------------------------------ dunning ------------------------------ */

export const DUNNING_STAGES = [
  { stage: 1, atDays: 1, label: "aviso" },
  { stage: 2, atDays: 3, label: "reintento de cobro" },
  { stage: 3, atDays: 7, label: "reintento de cobro" },
  { stage: 4, atDays: 14, label: "suspensión del servicio" },
  { stage: 5, atDays: 30, label: "terminación" },
] as const;

/** Etapa de dunning que corresponde a los días de retraso (0 = al día). */
export function dunningStageFor(daysOverdue: number): number {
  let stage = 0;
  for (const step of DUNNING_STAGES) {
    if (daysOverdue >= step.atDays) stage = step.stage;
  }
  return stage;
}

/**
 * Interruptor global de terminación. Por defecto false: sin él, el dunning
 * llega hasta la suspensión y la terminación queda pendiente, registrada
 * como omitida, sin cancelar nada.
 */
export function dunningTerminateEnabled(): boolean {
  return (process.env.DUNNING_TERMINATE_ENABLED || "").trim().toLowerCase() === "true";
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

async function auditEvent(
  action: string,
  entityId: string | null,
  details: string,
): Promise<void> {
  await db.commerceEvent
    .create({
      data: {
        actor: "billing-cron",
        action,
        entityId,
        details: sanitizeAudit(details),
      },
    })
    .catch(() => {
      // La traza no debe romper la corrida.
    });
  // Doble escritura (Fase 6): también a AuditLog, mejor esfuerzo.
  const resourceType =
    action === "billing.renewal_failed"
      ? "subscription"
      : action.startsWith("billing.") && entityId
        ? "invoice"
        : null;
  await writeAuditLog({
    actorType: "system",
    actorId: "billing-cron",
    action,
    resourceType,
    resourceId: entityId,
    details,
  });
}

async function customerEmail(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId } }).catch(() => null);
  return user?.email ?? null;
}

/* ------------------------------ cobro de renovación ------------------------------ */

/**
 * Intenta dejar pagada una factura de renovación:
 * - Total 0 (cubierta entera con crédito): se marca pagada sin pasarela,
 *   con un cobro de importe 0 con provider "credit".
 * - Stripe con suscripción guardada: se cobra con el método guardado; si
 *   funciona, se registra con recordGatewayPayment (providerRef único por
 *   renovación: la factura de Stripe). Si falla, queda pendiente.
 * - Sin método guardado: queda pendiente; el cliente la paga a mano y el
 *   dunning la recoge al vencer.
 */
async function settleRenewalInvoice(
  subscription: {
    id: string;
    billingCycle: string;
    gatewayKey: string | null;
    gatewaySubscriptionId: string | null;
    nextInvoiceAt: Date;
  },
  invoice: {
    id: string;
    orderId: string;
    number: string;
    currency: string;
    totalCents: number;
  },
): Promise<"paid" | "pending"> {
  if (invoice.totalCents <= 0) {
    await db.$transaction(async (tx) => {
      await tx.customerInvoice.update({
        where: { id: invoice.id },
        data: { status: "paid" },
      });
      await tx.customerOrder.update({
        where: { id: invoice.orderId },
        data: { status: "paid" },
      });
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          currency: invoice.currency,
          amountCents: 0,
          status: "confirmed",
          note: "Renovación cubierta con crédito, sin cobro en pasarela.",
          actor: "billing-cron",
          provider: "credit",
        },
      });
      await advanceSubscriptionAfterPayment(tx, subscription);
      await tx.commerceEvent.create({
        data: {
          actor: "billing-cron",
          action: "billing.renewal_paid",
          entityId: invoice.id,
          details: sanitizeAudit(`subscription=${subscription.id};cents=0;via=credito`),
        },
      });
    });
    return "paid";
  }
  if (subscription.gatewayKey === "stripe" && subscription.gatewaySubscriptionId) {
    try {
      const charged = await chargeStripeSubscriptionInvoice({
        gatewaySubscriptionId: subscription.gatewaySubscriptionId,
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        description: `Renovación ${invoice.number}`,
      });
      await recordGatewayPayment({
        invoiceId: invoice.id,
        provider: "stripe",
        providerRef: charged.providerRef,
        amountCents: charged.amountCents,
        currency: charged.currency,
        source: "webhook",
      });
      return "paid";
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "cobro no completado";
      await auditEvent(
        "billing.charge_failed",
        invoice.id,
        `subscription=${subscription.id};provider=stripe;error=${reason}`,
      );
      return "pending";
    }
  }
  return "pending";
}

/* ------------------------------ dunning por etapas ------------------------------ */

type OverdueInvoice = {
  id: string;
  userId: string;
  orderId: string;
  number: string;
  currency: string;
  totalCents: number;
  status: string;
  subscriptionId: string | null;
  dueDate: Date | null;
  dunningStage: number;
};

/** Ejecuta la acción de una etapa de dunning. Devuelve true si la etapa quedó aplicada. */
async function runDunningStage(
  invoice: OverdueInvoice,
  stage: number,
  daysOverdue: number,
): Promise<boolean> {
  const subscription = invoice.subscriptionId
    ? await db.subscription
        .findUnique({ where: { id: invoice.subscriptionId } })
        .catch(() => null)
    : null;
  const base = `invoice=${invoice.number};subscription=${invoice.subscriptionId ?? "-"};dias=${daysOverdue};etapa=${stage}`;

  if (stage === 1) {
    // Día 1: aviso por correo y la suscripción pasa a past_due.
    if (subscription?.status === "active") {
      await db.subscription
        .update({ where: { id: subscription.id }, data: { status: "past_due" } })
        .catch(() => {});
    }
    const email = await customerEmail(invoice.userId);
    let delivered = false;
    if (email) {
      const result = await deliverNotice({
        to: email,
        subject: `Tu factura ${invoice.number} venció — CaluServers`,
        text: [
          `Tu factura ${invoice.number} por ${money(invoice.totalCents, invoice.currency)} venció hace ${daysOverdue} día(s).`,
          "Puedes pagarla desde tu cuenta en CaluServers. Si no se cobra, el servicio se suspenderá a los 14 días.",
        ].join("\n"),
      }).catch(() => null);
      delivered = result?.delivered ?? false;
    }
    await db.customerInvoice
      .update({
        where: { id: invoice.id },
        data: { dunningStage: 1, reminderSentAt: new Date() },
      })
      .catch(() => {});
    await auditEvent(
      "billing.dunning",
      invoice.id,
      `${base};accion=aviso;entregado=${delivered ? "si" : "no"}`,
    );
    return true;
  }

  if (stage === 2 || stage === 3) {
    // Día 3 y 7: reintento de cobro automático con el método guardado.
    if (subscription) {
      const outcome = await settleRenewalInvoice(subscription, {
        id: invoice.id,
        orderId: invoice.orderId,
        number: invoice.number,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
      });
      if (outcome === "paid") {
        await auditEvent(
          "billing.dunning",
          invoice.id,
          `${base};accion=reintento-cobro;cobrado=si`,
        );
        return true;
      }
    }
    await db.customerInvoice
      .update({ where: { id: invoice.id }, data: { dunningStage: stage } })
      .catch(() => {});
    await auditEvent(
      "billing.dunning",
      invoice.id,
      `${base};accion=reintento-cobro;cobrado=no`,
    );
    return true;
  }

  if (stage === 4) {
    // Día 14: suspensión del servicio en SU panel (WHM, Plesk o
    // DirectAdmin según `service.panelKey`), no en WHM fijo. Si no hay
    // cuenta en ningún panel, queda registrado el motivo.
    let outcome = "sin-servicio";
    if (subscription?.serviceId) {
      const result = await suspendServicePanel({
        serviceId: subscription.serviceId,
        actor: "billing-cron",
      }).catch(() => null);
      outcome = result
        ? result.suspended
          ? "suspendido"
          : `no-suspendido:${result.reason}`
        : "error";
    }
    await db.customerInvoice
      .update({ where: { id: invoice.id }, data: { dunningStage: 4 } })
      .catch(() => {});
    await auditEvent(
      "billing.dunning",
      invoice.id,
      `${base};accion=suspension;resultado=${outcome}`,
    );
    return true;
  }

  // Día 30: terminación/cancelación, SOLO con el interruptor global.
  if (!dunningTerminateEnabled()) {
    const already = await db.commerceEvent
      .findFirst({
        where: {
          action: "billing.dunning",
          entityId: invoice.id,
          details: { contains: "accion=terminacion-omitida" },
        },
      })
      .catch(() => null);
    if (!already) {
      await auditEvent(
        "billing.dunning",
        invoice.id,
        `${base};accion=terminacion-omitida;motivo=interruptor-desactivado`,
      );
    }
    return false;
  }
  await db.$transaction(async (tx) => {
    if (subscription) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "cancelled" },
      });
      if (subscription.serviceId) {
        await tx.customerService
          .update({
            where: { id: subscription.serviceId },
            data: { status: "cancelled", note: "Cancelado por impago (dunning día 30)." },
          })
          .catch(() => {});
      }
    }
    await tx.customerInvoice.update({
      where: { id: invoice.id },
      data: { dunningStage: 5 },
    });
  });
  // La cancelación en BD ya está hecha y no se deshace aunque la
  // terminación falle: la cuenta se termina en SU panel (según
  // `service.panelKey`) fuera de la transacción, como la suspensión del
  // día 14, y el resultado queda en el diario.
  let termination = "sin-servicio";
  if (subscription?.serviceId) {
    const result = await terminateServicePanel({
      serviceId: subscription.serviceId,
      actor: "billing-cron",
    }).catch(() => null);
    termination = result
      ? result.terminated
        ? "terminado"
        : `no-terminado:${result.reason}`
      : "error";
  }
  await auditEvent(
    "billing.dunning",
    invoice.id,
    `${base};accion=terminacion;servicio=cancelado;terminacion=${termination}`,
  );
  return true;
}

async function advanceDunning(invoice: OverdueInvoice, now: Date): Promise<void> {
  if (!invoice.dueDate) return;
  const daysOverdue = daysBetween(invoice.dueDate, now);
  const targetStage = dunningStageFor(daysOverdue);
  if (targetStage <= invoice.dunningStage) return;
  let current = invoice.dunningStage;
  for (let stage = current + 1; stage <= targetStage; stage++) {
    const done = await runDunningStage(invoice, stage, daysOverdue);
    if (!done) break;
    current = stage;
    invoice = { ...invoice, dunningStage: current };
  }
}

/* ------------------------------ corrida de facturación ------------------------------ */

/**
 * Emite las renovaciones vencidas e intenta cobrarlas, y aplica el dunning
 * a las facturas de renovación impagas ya vencidas. Lotes de 50 en cada
 * fase. Una suscripción que ya tiene factura para el periodo no se vuelve
 * a facturar: el dunning la gestiona si vence impaga.
 */
export async function runBillingCron(input: { now?: Date } = {}): Promise<CronStats> {
  const now = input.now ?? new Date();
  const stats = emptyStats();

  const due = await db.subscription.findMany({
    where: { status: "active", nextInvoiceAt: { lte: now } },
    orderBy: { nextInvoiceAt: "asc" },
    take: 50,
  });
  for (const subscription of due) {
    const periodStart = new Date(subscription.nextInvoiceAt);
    try {
      const already = await db.customerInvoice.findUnique({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: subscription.id,
            periodStart,
          },
        },
      });
      if (already) continue;
      let invoice;
      try {
        invoice = await db.$transaction((tx) =>
          createRenewalInvoice(tx, subscription, periodStart),
        );
      } catch (error) {
        // Carrera con otra corrida: la factura ya existe, no es un fallo.
        if (isUniqueViolation(error)) continue;
        throw error;
      }
      stats.processed += 1;
      const outcome = await settleRenewalInvoice(subscription, invoice);
      if (outcome === "paid") {
        stats.succeeded += 1;
      } else {
        stats.details.push(
          `renovación ${invoice.number}: pendiente de cobro`,
        );
        // Consumo anormal (Fase 6): tras un cobro fallido, si el servicio
        // acumula 3 o más facturas de renovación vencidas sin cobrar, se
        // alerta una vez al día por servicio (dedupe en lib/alerts.ts).
        if (subscription.serviceId) {
          await maybeAlertAbnormalUsage({
            serviceId: subscription.serviceId,
            subscriptionId: subscription.id,
            now,
          }).catch(() => {});
        }
      }
    } catch (error) {
      stats.failed += 1;
      stats.details.push(
        `renovación ${subscription.id}: ${error instanceof Error ? error.message : "error"}`,
      );
      await auditEvent(
        "billing.renewal_failed",
        subscription.id,
        `subscription=${subscription.id};error=${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  const overdue = await db.customerInvoice.findMany({
    where: { type: "renewal", status: "issued", dueDate: { lte: now } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
  for (const invoice of overdue) {
    stats.processed += 1;
    try {
      await advanceDunning(invoice, now);
      stats.succeeded += 1;
    } catch (error) {
      stats.failed += 1;
      stats.details.push(
        `dunning ${invoice.number}: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  await auditEvent(
    "billing.run",
    null,
    `kind=billing;processed=${stats.processed};succeeded=${stats.succeeded};failed=${stats.failed}`,
  );
  return stats;
}

/* ------------------------------ recordatorios ------------------------------ */

/** Umbrales de aviso antes del vencimiento, en días. */
export const REMINDER_THRESHOLDS = [7, 3, 1] as const;

/**
 * Avisa de las facturas impagas que vencen en 7, 3 o 1 días. Un recordatorio
 * por factura y umbral (queda en el diario con `umbral=N`); si el correo
 * no está configurado, no se marca como enviado y el próximo día reintenta.
 */
export async function runRemindersCron(input: { now?: Date } = {}): Promise<CronStats> {
  const now = input.now ?? new Date();
  const stats = emptyStats();

  const invoices = await db.customerInvoice.findMany({
    where: { status: "issued", dueDate: { not: null } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;
    const daysLeft = Math.ceil(
      (invoice.dueDate.getTime() - now.getTime()) / 86_400_000,
    );
    if (
      daysLeft !== REMINDER_THRESHOLDS[0] &&
      daysLeft !== REMINDER_THRESHOLDS[1] &&
      daysLeft !== REMINDER_THRESHOLDS[2]
    ) {
      continue;
    }
    stats.processed += 1;
    try {
      const already = await db.commerceEvent.findFirst({
        where: {
          action: "billing.reminder",
          entityId: invoice.id,
          details: { contains: `umbral=${daysLeft}` },
        },
      });
      if (already) continue;
      const email = await customerEmail(invoice.userId);
      if (!email) {
        stats.details.push(`recordatorio ${invoice.number}: sin correo del cliente`);
        continue;
      }
      const daysWord = daysLeft === 1 ? "día" : "días";
      const result = await deliverNotice({
        to: email,
        subject: `Tu factura ${invoice.number} vence en ${daysLeft} ${daysWord} — CaluServers`,
        text: [
          `Tu factura ${invoice.number} por ${money(invoice.totalCents, invoice.currency)} vence en ${daysLeft} ${daysWord}.`,
          "Puedes pagarla desde tu cuenta en CaluServers.",
        ].join("\n"),
      });
      await auditEvent(
        "billing.reminder",
        invoice.id,
        `umbral=${daysLeft};entregado=${result.delivered ? "si" : "no"};via=${result.reason}`,
      );
      if (result.delivered) {
        await db.customerInvoice.update({
          where: { id: invoice.id },
          data: { reminderSentAt: now },
        });
        stats.succeeded += 1;
      } else {
        stats.details.push(
          `recordatorio ${invoice.number}: sin correo configurado`,
        );
      }
    } catch (error) {
      stats.failed += 1;
      stats.details.push(
        `recordatorio ${invoice.number}: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  await auditEvent(
    "billing.run",
    null,
    `kind=reminders;processed=${stats.processed};succeeded=${stats.succeeded};failed=${stats.failed}`,
  );
  return stats;
}
