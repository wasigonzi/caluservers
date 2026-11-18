import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { sanitizeAudit } from "./audit-sanitize";
import { writeAuditLogTx } from "./audit-log";
import { CommerceError } from "./commerce";
import { db } from "./db";

/**
 * Facturación recurrente (Fase 2, frente C).
 *
 * - Ciclos: monthly, quarterly, semiannual y annual. Un ciclo desconocido
 *   es un error, nunca se adivina un mes.
 * - Las promos son solo del primer pedido: la renovación nunca lleva
 *   descuento. El crédito sí se aplica a la renovación, antes que la
 *   pasarela, y queda congelado en la línea de factura.
 * - El impuesto sale de las TaxRule activas en BD. Sin regla activa no hay
 *   impuesto (taxMode "none"); con reglas, se calcula con rateBps. Una
 *   factura con taxMode "unconfigured" nunca se cobra (lo impide
 *   recordPayment en lib/commerce.ts).
 * - createRenewalInvoice es idempotente por (subscriptionId, periodStart):
 *   si la factura ya existe, se devuelve sin duplicar.
 */

export const BILLING_CYCLES = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
} as const;

export type BillingCycle = keyof typeof BILLING_CYCLES;

/** Meses que cubre un ciclo. Un ciclo desconocido es un error, no un mes. */
export function billingCycleMonths(cycle: string): number {
  const months = (BILLING_CYCLES as Record<string, number | undefined>)[cycle];
  if (months === undefined) {
    throw new CommerceError(`Ciclo de facturación no reconocido: ${cycle}.`, 400);
  }
  return months;
}

/**
 * Avanza una fecha un ciclo, con tope a fin de mes (31 ene + 1 mes = 28 feb).
 * Es la misma regla que usaba lib/commerce.ts para el ciclo mensual.
 */
export function advanceInvoiceDate(from: Date, cycle: string): Date {
  const months = billingCycleMonths(cycle);
  const result = new Date(from);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export type SubscriptionInput = {
  userId: string;
  serviceId: string;
  orderId: string;
  planId: string;
  priceCents: number;
  currency: string;
  gatewayKey?: string | null;
  billingCycle?: string;
};

/**
 * Crea la suscripción de facturación recurrente al confirmarse el primer
 * pago de un servicio. Idempotente por servicio: si ya existe, se devuelve
 * la que hay. Ciclo mensual por defecto; la próxima factura vence en un
 * ciclo. (Movida desde lib/commerce.ts; la llamada en recordPayment sigue
 * igual.)
 */
export async function createSubscriptionForService(
  tx: Prisma.TransactionClient,
  input: SubscriptionInput,
) {
  const existing = await tx.subscription.findUnique({
    where: { serviceId: input.serviceId },
  });
  if (existing) return existing;
  const cycle = input.billingCycle ?? "monthly";
  billingCycleMonths(cycle);
  return tx.subscription.create({
    data: {
      userId: input.userId,
      serviceId: input.serviceId,
      orderId: input.orderId,
      planId: input.planId,
      billingCycle: cycle,
      priceCents: input.priceCents,
      currency: input.currency,
      nextInvoiceAt: advanceInvoiceDate(new Date(), cycle),
      status: "active",
      gatewayKey: input.gatewayKey ?? null,
    },
  });
}

/**
 * Al cobrarse una factura (inicial o de renovación), la suscripción vuelve
 * a activa y su próxima factura avanza un ciclo desde la que acababa de
 * vencer. Un solo sitio avanza nextInvoiceAt: o lo hace el cobro aquí, o
 * no avanza nadie.
 */
export async function advanceSubscriptionAfterPayment(
  tx: Prisma.TransactionClient,
  subscription: { id: string; nextInvoiceAt: Date; billingCycle: string },
) {
  return tx.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "active",
      nextInvoiceAt: advanceInvoiceDate(subscription.nextInvoiceAt, subscription.billingCycle),
    },
  });
}

export type TaxQuote = { taxCents: number; taxMode: "none" | "tax" };

/**
 * Impuesto de un subtotal según las TaxRule activas. Sin regla activa no
 * hay impuesto (taxMode "none"). Con reglas, se suman sus rateBps y se
 * aplica el total al subtotal, redondeado al céntimo.
 */
export async function applyTaxCents(subtotalCents: number): Promise<TaxQuote> {
  const rules = await db.taxRule.findMany({ where: { active: true } });
  if (rules.length === 0) return { taxCents: 0, taxMode: "none" };
  const totalBps = rules.reduce((sum, rule) => sum + rule.rateBps, 0);
  return {
    taxCents: Math.round((subtotalCents * totalBps) / 10000),
    taxMode: "tax",
  };
}

export type CreditUse = { creditId: string; appliedCents: number };

/**
 * Consume crédito no vencido del cliente, por orden de creación (el más
 * viejo primero), hasta cubrir `amountCents`. El saldo que se agota se
 * borra; el parcial se descuenta. Devuelve lo aplicado y qué créditos se
 * tocaron, para congelarlo en la línea de factura.
 */
export async function applyCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  amountCents: number,
  now = new Date(),
): Promise<{ appliedCents: number; creditsUsed: CreditUse[] }> {
  if (amountCents <= 0) return { appliedCents: 0, creditsUsed: [] };
  const credits = await tx.credit.findMany({
    where: {
      userId,
      amountCents: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
  let remaining = amountCents;
  const creditsUsed: CreditUse[] = [];
  for (const credit of credits) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, credit.amountCents);
    if (applied <= 0) continue;
    const left = credit.amountCents - applied;
    if (left <= 0) {
      await tx.credit.delete({ where: { id: credit.id } });
    } else {
      await tx.credit.update({
        where: { id: credit.id },
        data: { amountCents: left },
      });
    }
    creditsUsed.push({ creditId: credit.id, appliedCents: applied });
    remaining -= applied;
  }
  return { appliedCents: amountCents - remaining, creditsUsed };
}

export type Promo = {
  id: string;
  code: string;
  kind: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: Date | null;
  validTo: Date | null;
  appliesTo: string | null;
  active: boolean;
};

/**
 * Valida un código sin tocar usedCount: validar nunca gasta el código.
 * El incremento ocurre solo al confirmar el pedido (consumePromoUse),
 * dentro de la misma transacción que crea el pedido.
 */
export async function validatePromoCode(
  code: string,
  planId: string | null,
  subtotalCents: number,
  now = new Date(),
): Promise<Promo> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    throw new CommerceError("Indica un código promocional.", 400);
  }
  const promo = await db.promoCode.findUnique({ where: { code: normalized } });
  if (!promo) {
    throw new CommerceError("Ese código promocional no existe.", 404);
  }
  if (!promo.active) {
    throw new CommerceError("Ese código promocional está desactivado.", 409);
  }
  if (promo.validFrom && now < promo.validFrom) {
    throw new CommerceError("Ese código promocional aún no es válido.", 409);
  }
  if (promo.validTo && now > promo.validTo) {
    throw new CommerceError("Ese código promocional caducó.", 409);
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw new CommerceError(
      "Ese código promocional ya se usó todas las veces permitidas.",
      409,
    );
  }
  if (planId && promo.appliesTo && promo.appliesTo !== planId) {
    throw new CommerceError("Ese código promocional no se aplica a este plan.", 409);
  }
  if (subtotalCents <= 0) {
    throw new CommerceError("El código promocional no se aplica a un importe cero.", 409);
  }
  return promo as Promo;
}

/** Descuento de una promo validada: percent (0-100) o fixed en céntimos. Nunca supera el subtotal. */
export function discountForPromo(
  promo: { kind: string; value: number },
  subtotalCents: number,
): number {
  if (promo.kind === "percent") {
    if (promo.value <= 0 || promo.value > 100) {
      throw new CommerceError("El porcentaje del código promocional no es válido.", 409);
    }
    return Math.min(subtotalCents, Math.round((subtotalCents * promo.value) / 100));
  }
  if (promo.kind === "fixed") {
    if (promo.value <= 0) {
      throw new CommerceError("El importe del código promocional no es válido.", 409);
    }
    return Math.min(subtotalCents, promo.value);
  }
  throw new CommerceError("El tipo del código promocional no es válido.", 409);
}

/** Valida el código y calcula su descuento, sin gastar el uso. */
export async function applyPromo(
  code: string,
  subtotalCents: number,
  planId?: string | null,
): Promise<{ discountCents: number; promo: Promo }> {
  const promo = await validatePromoCode(code, planId ?? null, subtotalCents);
  return { discountCents: discountForPromo(promo, subtotalCents), promo };
}

/**
 * Gasta un uso de la promo dentro de la transacción del pedido. La
 * condición (usedCount < maxUses) va en el WHERE: si dos pedidos llegan a
 * la vez con el último uso, solo uno lo gasta y el otro recibe 409.
 */
export async function consumePromoUse(
  tx: Prisma.TransactionClient,
  promo: { id: string; maxUses: number | null },
): Promise<void> {
  const result = await tx.promoCode.updateMany({
    where:
      promo.maxUses === null
        ? { id: promo.id }
        : { id: promo.id, usedCount: { lt: promo.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new CommerceError(
      "Ese código promocional ya se usó todas las veces permitidas.",
      409,
    );
  }
}

export type RenewalSubscription = {
  id: string;
  userId: string;
  orderId: string;
  planId: string;
  billingCycle: string;
  priceCents: number;
  currency: string;
};

/**
 * Emite la factura de renovación de un periodo. Idempotente por
 * (subscriptionId, periodStart): si ya existe, se devuelve sin duplicar.
 *
 * - El subtotal es el precio de la suscripción menos el crédito aplicado;
 *   el crédito queda congelado en una línea negativa.
 * - Las promos son solo del primer pedido: la renovación nunca lleva
 *   descuento.
 * - El impuesto se calcula sobre el subtotal tras el crédito, con las
 *   TaxRule activas.
 * - total = subtotal + impuesto; dueDate = fin del periodo.
 * - La factura cuelga de un pedido de renovación propio (CustomerInvoice
 *   exige orderId único): mismo plan y dominio que el pedido original.
 */
export async function createRenewalInvoice(
  tx: Prisma.TransactionClient,
  subscription: RenewalSubscription,
  periodStart: Date,
) {
  const existing = await tx.customerInvoice.findUnique({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: subscription.id,
        periodStart,
      },
    },
  });
  if (existing) return existing;

  const periodEnd = advanceInvoiceDate(periodStart, subscription.billingCycle);
  const original = await tx.customerOrder.findUnique({
    where: { id: subscription.orderId },
  });
  const planName = original?.planName ?? subscription.planId;
  const { appliedCents } = await applyCredits(
    tx,
    subscription.userId,
    subscription.priceCents,
  );
  const subtotalCents = subscription.priceCents - appliedCents;
  const { taxCents, taxMode } = await applyTaxCents(subtotalCents);
  const totalCents = subtotalCents + taxCents;
  const day = periodStart.toISOString().slice(0, 10).replaceAll("-", "");
  const periodLabel = `${periodStart.toISOString().slice(0, 10)} – ${periodEnd
    .toISOString()
    .slice(0, 10)}`;

  const planLine = {
    planId: subscription.planId,
    description: `${planName} · renovación ${periodLabel}`,
    quantity: 1,
    unitCents: subscription.priceCents,
    totalCents: subscription.priceCents,
  };
  const creditLine =
    appliedCents > 0
      ? {
          planId: subscription.planId,
          description: "Crédito aplicado",
          quantity: 1,
          unitCents: -appliedCents,
          totalCents: -appliedCents,
        }
      : null;
  const orderLines = creditLine ? [planLine, creditLine] : [planLine];
  const invoiceLines = orderLines.map(({ planId: _planId, ...line }) => line);

  const order = await tx.customerOrder.create({
    data: {
      userId: subscription.userId,
      idempotencyKey: `renewal-${subscription.id}-${day}`,
      trackingToken: randomBytes(24).toString("hex"),
      planId: subscription.planId,
      planName,
      domain: original?.domain ?? null,
      currency: subscription.currency,
      totalCents,
      status: "submitted",
      lines: { create: orderLines },
    },
  });
  const invoice = await tx.customerInvoice.create({
    data: {
      userId: subscription.userId,
      orderId: order.id,
      number: `RN-${subscription.id.slice(-8).toUpperCase()}-${day}`,
      currency: subscription.currency,
      subtotalCents,
      taxMode,
      taxCents,
      totalCents,
      status: "issued",
      type: "renewal",
      subscriptionId: subscription.id,
      periodStart,
      periodEnd,
      dueDate: periodEnd,
      lines: { create: invoiceLines },
    },
  });
  await tx.commerceEvent.create({
    data: {
      actor: "billing-cron",
      action: "billing.renewal_created",
      entityId: invoice.id,
      details: sanitizeAudit(
        `subscription=${subscription.id};period=${periodStart
          .toISOString()
          .slice(0, 10)};cents=${totalCents};currency=${subscription.currency};tax=${taxMode};credit=${appliedCents}`,
      ),
    },
  });
  // Doble escritura (Fase 6): también a AuditLog, en la misma transacción.
  await writeAuditLogTx(tx, {
    actorType: "system",
    actorId: "billing-cron",
    action: "billing.renewal_created",
    resourceType: "invoice",
    resourceId: invoice.id,
    details: `subscription=${subscription.id};cents=${totalCents};currency=${subscription.currency}`,
  });
  return invoice;
}
