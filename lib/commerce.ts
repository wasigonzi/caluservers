import { randomBytes } from "node:crypto";
import { sanitizeAudit } from "./audit-sanitize";
import { actorTypeFor, writeAuditLog, writeAuditLogTx } from "./audit-log";
import {
  advanceSubscriptionAfterPayment,
  applyPromo,
  consumePromoUse,
  createSubscriptionForService,
} from "./billing-recurring";
import { parseCatalogPayload, seedCatalogPayload } from "./catalog-validate";
import { db } from "./db";
import { isPanelKey, parsePanelMap } from "./whm-provision";
import { DomainNameError, normalizeDomainName } from "./domain-name";
import { isOrderablePlan } from "./orderable";

export class CommerceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

/** Pedidos de dominio (Fase 3): no crean servicio ni suscripción de hosting. */
export const DOMAIN_PLAN_IDS = ["domain", "domain-renewal", "domain-transfer"] as const;

async function sellableCatalog() {
  try {
    const row = await db.catalogConfig.findUnique({ where: { id: "default" } });
    if (!row) return seedCatalogPayload();
    return parseCatalogPayload(row.payload) ?? seedCatalogPayload();
  } catch {
    return seedCatalogPayload();
  }
}

export function parsePublicPriceToCents(price: string): number | null {
  const match = price.trim().match(/^\$(\d{1,6})\.(\d{2})$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function billingPolicy() {
  const currency = (process.env.BILLING_CURRENCY || "").trim();
  const taxMode = (process.env.TAX_MODE || "").trim();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false as const, error: "La moneda no está configurada. El propietario debe definir BILLING_CURRENCY." };
  }
  if (taxMode !== "none") {
    return {
      ok: false as const,
      error: "La política de impuestos no está decidida. Define TAX_MODE=none solo si no hay impuesto, o deja el pedido como proforma no cobrable.",
      currency,
      taxMode: taxMode || "unconfigured",
    };
  }
  return { ok: true as const, currency, taxMode: "none" as const };
}

/** Los planes de hosting se dan de alta en cPanel y necesitan un dominio declarado. */
export function orderDomainFor(kind: PlanKind, raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (kind !== "webHosting") return null;
  if (!value) {
    throw new CommerceError(
      "Indica el dominio que usarás con este plan de hosting.",
      400,
    );
  }
  try {
    return normalizeDomainName(value);
  } catch (error) {
    throw new CommerceError(
      error instanceof DomainNameError ? error.message : "Dominio no válido.",
      400,
    );
  }
}

export type PlanKind = "webHosting" | "vps" | "dedicated";

/** Token público de seguimiento del pedido: 48 hex, no adivinable. */
export function generateOrderTrackingToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createCustomerOrder(input: {
  userId: string;
  planId: string;
  idempotencyKey: string;
  domain?: string;
  /** Código promocional opcional: solo del primer pedido, nunca de renovaciones. */
  promoCode?: string;
  /** SHA-256 de la IP del cliente, si quien llama la conoce (regla de IP de fraude). */
  ipHash?: string;
}) {
  const key = input.idempotencyKey.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new CommerceError("La clave de idempotencia no es válida.", 400);
  }
  const policy = billingPolicy();
  if (!policy.currency) throw new CommerceError(policy.ok ? "Moneda no configurada." : policy.error, 409);
  const catalog = await sellableCatalog();
  const groups: [PlanKind, typeof catalog.webHosting][] = [
    ["webHosting", catalog.webHosting],
    ["vps", catalog.vps],
    ["dedicated", catalog.dedicated],
  ];
  let kind: PlanKind = "webHosting";
  let plan: (typeof catalog.webHosting)[number] | undefined;
  for (const [group, items] of groups) {
    const found = items.find((item) => item.id === input.planId && item.active);
    if (found) {
      kind = group;
      plan = found;
      break;
    }
  }
  if (!plan || !isOrderablePlan(plan)) {
    throw new CommerceError("Ese plan no está disponible para contratación nativa.", 404);
  }
  const domain = orderDomainFor(kind, input.domain);
  const unitCents = parsePublicPriceToCents(plan.price);
  if (unitCents === null) throw new CommerceError("El precio público de ese plan no es contratable.", 409);
  const currency = policy.currency;
  const taxMode = policy.ok ? "none" : "unconfigured";
  const taxCents = policy.ok ? 0 : null;
  const payable = policy.ok;
  // La promo se valida antes de crear nada (validar no gasta el uso) y el
  // uso se incrementa dentro de la transacción, al confirmar el pedido.
  let discountCents = 0;
  let promo: { id: string; code: string; maxUses: number | null } | null = null;
  if (input.promoCode?.trim()) {
    const applied = await applyPromo(input.promoCode, unitCents, plan.id);
    discountCents = applied.discountCents;
    promo = applied.promo;
  }
  const orderTotalCents = unitCents - discountCents;

  // Un choque de token único es casi imposible, pero si ocurre se reintenta
  // con otro token; el segundo intento además resuelve la carrera de dos
  // pedidos con la misma clave de idempotencia devolviendo el ya creado.
  let created: Awaited<ReturnType<typeof createOrderTx>> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      created = await createOrderTx();
      break;
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
  if (!created) throw new CommerceError("No se pudo crear el pedido.", 503);
  // Evaluación de fraude (Fase 6): DESPUÉS de crear el pedido y ANTES de
  // cobrar (el cobro es otra llamada posterior). Si marca, el pedido queda
  // señalado para revisión con el evento `fraud.flagged`; el pago NO se
  // bloquea por defecto y el pedido sigue su flujo normal. La evaluación
  // nunca tumba la creación del pedido: cualquier fallo se traga aquí.
  await flagOrderForReview(created, input).catch(() => {
    // Ni el pedido ni su factura dependen de esta revisión.
  });
  return created;

  async function createOrderTx() {
    // El narrowing del ámbito exterior no cruza a esta función interna:
    // se repiten aquí las dos comprobaciones que ya se hicieron fuera.
    if (!plan) throw new CommerceError("Ese plan no está disponible para contratación nativa.", 404);
    const cents = unitCents;
    if (cents === null) throw new CommerceError("El precio público de ese plan no es contratable.", 409);
    return db.$transaction(async (tx) => {
        const existing = await tx.customerOrder.findUnique({
          where: { idempotencyKey: key },
          include: { invoice: true },
        });
        if (existing) {
          if (existing.userId !== input.userId || existing.planId !== plan.id) {
            throw new CommerceError("Esa clave de idempotencia ya pertenece a otro pedido.", 409);
          }
          return existing;
        }
        const planLine = {
          planId: plan.id,
          description: `${plan.name} · ciclo mensual`,
          quantity: 1,
          unitCents: cents,
          totalCents: cents,
        };
        // El descuento queda congelado en una línea negativa del pedido y de
        // la factura; el subtotal ya lo descuenta, así que total = subtotal +
        // impuesto sigue cuadrando en recordPayment.
        const discountLine =
          discountCents > 0 && promo
            ? {
                planId: plan.id,
                description: `Descuento ${promo.code}`,
                quantity: 1,
                unitCents: -discountCents,
                totalCents: -discountCents,
              }
            : null;
        const orderLines = discountLine ? [planLine, discountLine] : [planLine];
        const order = await tx.customerOrder.create({
          data: {
            userId: input.userId,
            idempotencyKey: key,
            trackingToken: generateOrderTrackingToken(),
            planId: plan.id,
        planName: plan.name,
        domain,
        currency,
        totalCents: orderTotalCents,
        status: "submitted",
        lines: { create: orderLines },
      },
    });
    const invoice = await tx.customerInvoice.create({
      data: {
        userId: input.userId,
        orderId: order.id,
        number: `PF-${order.id.slice(-8).toUpperCase()}`,
        currency,
        subtotalCents: orderTotalCents,
        taxMode,
        taxCents,
        totalCents: orderTotalCents,
        status: payable ? "issued" : "proforma",
        lines: {
          create: orderLines.map(({ planId: _planId, ...line }) => line),
        },
      },
    });
    if (promo) await consumePromoUse(tx, promo);
    await tx.commerceEvent.create({
      data: {
        actor: input.userId,
        action: "order.created",
        entityId: order.id,
        details: sanitizeAudit(`plan=${plan.id};cents=${orderTotalCents};currency=${currency};tax=${taxMode};domain=${domain ?? "-"}${promo ? `;promo=${promo.code}` : ""}`),
      },
    });
    // Doble escritura (Fase 6): también a AuditLog, en la misma transacción.
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.userId),
      actorId: input.userId,
      action: "order.created",
      resourceType: "order",
      resourceId: order.id,
      details: `plan=${plan.id};cents=${orderTotalCents};currency=${currency};tax=${taxMode};domain=${domain ?? "-"}`,
    });
    return { ...order, invoice };
      });
  }
}

/**
 * Revisión de fraude de un pedido recién creado (Fase 6). Importación
 * dinámica para no crear un ciclo entre commerce y fraud. No lanza nunca:
 * si la evaluación o el evento fallan, el pedido sigue su flujo normal.
 * No reevalúa un pedido ya marcado: si el mismo pedido se devuelve por
 * idempotencia, no se duplican los flags.
 */
async function flagOrderForReview(
  created: { id: string; userId: string; totalCents: number },
  input: { userId: string; ipHash?: string },
): Promise<void> {
  const already = await db.commerceEvent
    .findFirst({ where: { action: "fraud.flagged", entityId: created.id } })
    .catch(() => null);
  if (already) return;
  const { evaluateFraud } = await import("./fraud");
  const user = await db.user
    .findUnique({ where: { id: input.userId }, select: { email: true } })
    .catch(() => null);
  const result = await evaluateFraud({
    userId: input.userId,
    orderId: created.id,
    email: user?.email ?? null,
    ipHash: input.ipHash ?? null,
    totalCents: created.totalCents,
    db,
  });
  if (!result.flagged) return;
  await db.commerceEvent.create({
    data: {
      actor: input.userId,
      action: "fraud.flagged",
      entityId: created.id,
      details: sanitizeAudit(`order=${created.id};flags=${result.flags.length}`),
    },
  });
}

/**
 * Registra el cobro de una factura y crea el servicio pendiente de alta.
 * Lo comparten el cobro manual del administrador y la captura de la pasarela:
 * las dos vías pasan por las mismas comprobaciones y por la misma transacción.
 *
 * Idempotente por la unicidad de `Payment.invoiceId`: un segundo intento
 * (reintento de PayPal, webhook duplicado) devuelve el cobro ya guardado.
 */
async function recordPayment(input: {
  actor: string;
  invoiceId: string;
  note: string;
  provider: "manual" | "paypal" | "stripe" | "bank_transfer";
  providerRef?: string;
  /** Importe cobrado de verdad. La pasarela lo aporta; el manual usa el de la factura. */
  paidCents?: number;
  paidCurrency?: string;
  serviceNote: string;
}) {
  const policy = billingPolicy();
  if (!policy.ok) throw new CommerceError(policy.error, 409);
  // El hook de dominios (Fase 3) corre DESPUÉS de confirmar la transacción:
  // solo si este cobro creó el pago, y solo si el pedido es de dominio.
  let createdPayment = false;
  let domainOrderId: string | null = null;
  const payment = await db.$transaction(async (tx) => {
    const invoice = await tx.customerInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { payment: true, order: true, lines: true },
    });
    if (!invoice) throw new CommerceError("Factura no encontrada.", 404);
    if (invoice.payment?.status === "confirmed") return invoice.payment;
    if (invoice.status === "void") throw new CommerceError("La factura está anulada.", 409);
    // Solo se cobra con el impuesto decidido: "none" (sin TaxRule activa)
    // o "tax" (con TaxRule activa). "unconfigured" nunca se cobra.
    if (invoice.taxMode !== "none" && invoice.taxMode !== "tax") {
      throw new CommerceError("No se confirma un pago mientras el impuesto no esté decidido.", 409);
    }
    if (
      invoice.currency !== policy.currency ||
      invoice.totalCents !== invoice.subtotalCents + (invoice.taxCents ?? 0)
    ) {
      throw new CommerceError("El total de la factura no cuadra.", 409);
    }
    // Lo cobrado tiene que ser exactamente lo facturado: ni un céntimo de diferencia.
    if (input.paidCents !== undefined && input.paidCents !== invoice.totalCents) {
      throw new CommerceError("El importe cobrado no coincide con la factura.", 409);
    }
    if (input.paidCurrency !== undefined && input.paidCurrency !== invoice.currency) {
      throw new CommerceError("La moneda cobrada no coincide con la factura.", 409);
    }
    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        currency: invoice.currency,
        amountCents: invoice.totalCents,
        status: "confirmed",
        note: input.note,
        actor: input.actor,
        provider: input.provider,
        providerRef: input.providerRef ?? null,
      },
    });
    createdPayment = true;
    // Pedido de dominio: el registro/renovación lo ejecuta el hook de
    // dominios tras confirmar la transacción (ver abajo).
    if ((DOMAIN_PLAN_IDS as readonly string[]).includes(invoice.order.planId)) {
      domainOrderId = invoice.orderId;
    }
    await tx.customerInvoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    await tx.customerOrder.update({
      where: { id: invoice.orderId },
      data: { status: "paid" },
    });
    if (invoice.type === "renewal") {
      // La renovación no crea otro servicio ni otra suscripción: el servicio
      // ya existe y la suscripción solo avanza un ciclo y vuelve a activa.
      // (El pedido de renovación es propio; su estado ya se marcó "paid".)
      if (invoice.subscriptionId) {
        const subscription = await tx.subscription.findUnique({
          where: { id: invoice.subscriptionId },
        });
        if (subscription) {
          await advanceSubscriptionAfterPayment(tx, subscription);
        }
      }
    } else if (!(DOMAIN_PLAN_IDS as readonly string[]).includes(invoice.order.planId)) {
      // Un pedido de dominio NO da de alta hosting: ni CustomerService ni
      // Subscription (invariante de lib/domains.ts). El registro, la
      // renovación o la transferencia los ejecuta afterDomainPayment tras
      // la transacción (hook al final de recordPayment).
      //
      // El precio recurrente es el del plan sin el descuento del primer
      // pedido: las líneas positivas suman el precio del plan (la promo
      // es una línea negativa). Sin líneas (datos viejos), el total.
      const baseCents = (invoice.lines ?? []).reduce(
        (sum, line) => sum + Math.max(0, line.totalCents),
        0,
      );
      const priceCents = baseCents > 0 ? baseCents : invoice.totalCents;
      // Panel del servicio según el plan (`panelByPlan` en la configuración
      // de alta): si no hay nada guardado, "whm". Sin configuración no se
      // bloquea el cobro: el servicio nace con el panel por defecto.
      let panelKey = "whm";
      try {
        const provisionSetting = await tx.provisionSetting.findUnique({
          where: { id: "whm" },
        });
        const byPlan = parsePanelMap(provisionSetting?.panelByPlan);
        if (isPanelKey(byPlan[invoice.order.planId])) panelKey = byPlan[invoice.order.planId];
      } catch {
        panelKey = "whm";
      }
      const service = await tx.customerService.create({
        data: {
          userId: invoice.userId,
          orderId: invoice.orderId,
          planId: invoice.order.planId,
          planName: invoice.order.planName,
          status: "pending_provision",
          panelKey,
          note: input.serviceNote,
        },
      });
      await createSubscriptionForService(tx, {
        userId: invoice.userId,
        serviceId: service.id,
        orderId: invoice.orderId,
        planId: invoice.order.planId,
        priceCents,
        currency: invoice.currency,
        gatewayKey: input.provider === "manual" ? null : input.provider,
      });
    }
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "payment.confirmed",
        entityId: payment.id,
        details: sanitizeAudit(`invoice=${invoice.id};cents=${payment.amountCents};currency=${payment.currency};provider=${input.provider}`),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: "payment.confirmed",
      resourceType: "payment",
      resourceId: payment.id,
      details: `invoice=${invoice.id};cents=${payment.amountCents};currency=${payment.currency};provider=${input.provider}`,
    });
    return payment;
  });
  // Hook de dominios (Fase 3): tras la transacción, si el pedido es de
  // dominio, se registra/renueva/transfiere en el registrador. La
  // importación es dinámica para no crear un ciclo entre commerce y
  // domains. Un fallo del registrador NUNCA tumba el pago: queda en el
  // diario como domain.register_failed y el admin lo reintenta.
  if (createdPayment && domainOrderId) {
    try {
      const { afterDomainPayment } = await import("./domains");
      await afterDomainPayment(domainOrderId);
    } catch (error) {
      await db.commerceEvent
        .create({
          data: {
            actor: input.actor,
            action: "domain.register_failed",
            entityId: domainOrderId,
            details: sanitizeAudit(
              `order=${domainOrderId};error=${error instanceof Error ? error.message : "registro no completado"}`,
            ),
          },
        })
        .catch(() => {
          // Ni el pago ni su evento dependen de esta traza.
        });
      // Doble escritura (Fase 6): también a AuditLog, mejor esfuerzo.
      void writeAuditLog({
        actorType: actorTypeFor(input.actor),
        actorId: input.actor,
        action: "domain.register_failed",
        resourceType: "order",
        resourceId: domainOrderId,
        details: `order=${domainOrderId}`,
      });
    }
  }
  return payment;
}

/** Devuelve el cobro ya guardado cuando dos vías llegan a la vez a la misma factura. */
async function existingPayment(invoiceId: string) {
  const invoice = await db.customerInvoice.findUnique({
    where: { id: invoiceId },
    include: { payment: true },
  });
  return invoice?.payment ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return Object.getOwnPropertyDescriptor(error, "code")?.value === "P2002";
}

/**
 * Marca un cobro confirmado como reembolsado, solo en BD, con nota y
 * evento en el diario. No borra nada y no toca la factura, el pedido ni
 * el servicio: el reembolso real en la pasarela lo hace quien llama
 * (Stripe) o el admin a mano (PayPal, transferencia). Un cobro ya
 * reembolsado no se vuelve a marcar.
 */
export async function markPaymentRefunded(input: {
  actor: string;
  paymentId: string;
  note: string;
}) {
  const note = input.note.trim();
  if (note.length < 8 || note.length > 500) {
    throw new CommerceError("La nota del reembolso debe explicar el motivo.", 400);
  }
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment) throw new CommerceError("Cobro no encontrado.", 404);
    if (payment.status === "refunded") {
      throw new CommerceError("Ese cobro ya está reembolsado.", 409);
    }
    if (payment.status !== "confirmed") {
      throw new CommerceError("Solo se reembolsa un cobro confirmado.", 409);
    }
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "refunded" },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "payment.refunded",
        entityId: payment.id,
        details: sanitizeAudit(
          `invoice=${payment.invoiceId};cents=${payment.amountCents};provider=${payment.provider};note=${note}`,
        ),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: "payment.refunded",
      resourceType: "payment",
      resourceId: payment.id,
      details: `invoice=${payment.invoiceId};cents=${payment.amountCents};provider=${payment.provider}`,
    });
    return updated;
  });
}

export async function confirmManualPayment(input: {
  actor: string;
  invoiceId: string;
  note: string;
  /** Por defecto "manual". "bank_transfer" es el cobro por transferencia que el admin confirma a mano. */
  provider?: "manual" | "bank_transfer";
}) {
  const note = input.note.trim();
  if (note.length < 8 || note.length > 500) {
    throw new CommerceError("La nota de confirmación debe explicar el cobro recibido.", 400);
  }
  const provider = input.provider ?? "manual";
  const via =
    provider === "bank_transfer" ? "transferencia bancaria" : "manual";
  return recordPayment({
    actor: input.actor,
    invoiceId: input.invoiceId,
    note,
    provider,
    serviceNote: `Pago por ${via} confirmado por un administrador. Falta el alta del servicio.`,
  });
}

/**
 * Registra una captura de pasarela ya verificada. `providerRef` es el id de
 * captura (PayPal) o el payment_intent (Stripe): es único en la tabla, así
 * que un webhook repetido no duplica el cobro. La nota y el actor reflejan
 * la pasarela real.
 */
export async function recordGatewayPayment(input: {
  invoiceId: string;
  providerRef: string;
  amountCents: number;
  currency: string;
  source: "capture" | "webhook";
  /** Por defecto "paypal": es la vía que ya existía antes de generalizar. */
  provider?: "paypal" | "stripe";
}) {
  const provider = input.provider ?? "paypal";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(input.providerRef)) {
    throw new CommerceError("La referencia de la pasarela no es válida.", 400);
  }
  const already = await db.payment.findUnique({
    where: { providerRef: input.providerRef },
  });
  if (already) return already;
  const label = provider === "stripe" ? "Stripe" : "PayPal";
  try {
    return await recordPayment({
      actor: provider,
      invoiceId: input.invoiceId,
      note: `Cobro con ${label} (${input.source}). Referencia ${input.providerRef}.`,
      provider,
      providerRef: input.providerRef,
      paidCents: input.amountCents,
      paidCurrency: input.currency,
      serviceNote: `Pago recibido por ${label}. Pendiente de alta del servicio.`,
    });
  } catch (error) {
    // Carrera entre la vuelta del cliente y el webhook: gana la primera inserción.
    if (isUniqueViolation(error)) {
      const payment = await existingPayment(input.invoiceId);
      if (payment) return payment;
    }
    throw error;
  }
}

export async function setServiceStatus(input: {
  actor: string;
  serviceId: string;
  status: "pending_provision" | "active" | "cancelled";
  note: string;
}) {
  const note = input.note.trim();
  if (note.length < 8) throw new CommerceError("Indica por qué cambia el estado del servicio.", 400);
  return db.$transaction(async (tx) => {
    const service = await tx.customerService.findUnique({
      where: { id: input.serviceId },
      include: { order: { include: { invoice: { include: { payment: true } } } } },
    });
    if (!service) throw new CommerceError("Servicio no encontrado.", 404);
    const paid = service.order.invoice?.payment?.status === "confirmed";
    if (input.status === "active") {
      if (!paid) throw new CommerceError("No se activa un servicio sin pago confirmado.", 409);
      if (service.status !== "pending_provision" && service.status !== "cancelled") {
        throw new CommerceError("Solo un servicio pendiente de alta o cancelado puede activarse.", 409);
      }
    }
    // El cerrojo de alta solo bloquea mientras es reciente: uno atascado se puede cancelar.
    if (
      service.status === "provisioning" &&
      Date.now() - service.updatedAt.getTime() < 2 * 60_000
    ) {
      throw new CommerceError("Hay un alta en curso para este servicio. Espera a que termine.", 409);
    }
    if (input.status === "cancelled" && service.status === "cancelled") {
      throw new CommerceError("El servicio ya está cancelado.", 409);
    }
    if (input.status === "pending_provision" && service.status === "active") {
      throw new CommerceError("No se puede devolver un servicio activo a pendiente.", 409);
    }
    const updated = await tx.customerService.update({
      where: { id: service.id },
      data: { status: input.status, note },
    });
    if (input.status === "cancelled") {
      // Cancelar el servicio marca su suscripción como cancelled para que
      // el cron no genere más facturas de renovación: solo se facturan las
      // suscripciones activas (`runBillingCron` filtra por status "active").
      // Si no hay suscripción, no pasa nada. La cancelación en BD nunca se
      // deshace aunque luego falle la suspensión/terminación en el panel:
      // eso ocurre fuera de esta transacción (ver la ruta).
      await tx.subscription.updateMany({
        where: { serviceId: service.id },
        data: { status: "cancelled" },
      });
    }
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "service.status",
        entityId: service.id,
        details: sanitizeAudit(`${service.status}->${input.status}`),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: "service.status",
      resourceType: "service",
      resourceId: service.id,
      details: `${service.status}->${input.status}`,
    });
    return updated;
  });
}

/**
 * Cambia el panel de un servicio (`panelKey`), con nota y evento en el
 * diario. Al cambiar de panel, el usuario guardado pertenece al panel
 * anterior y se limpia para no actuar en el panel nuevo con el usuario del
 * viejo; en WHM se recupera del `cpanelUser` heredado. No toca el estado
 * del servicio ni llama a ningún panel: solo cambia dónde se actuará a
 * partir de ahora. Valores válidos solo whm/plesk/directadmin/none.
 */
export async function setServicePanel(input: {
  actor: string;
  serviceId: string;
  panelKey: string;
  note: string;
}) {
  const note = input.note.trim();
  if (note.length < 8) throw new CommerceError("Indica por qué cambia el panel del servicio.", 400);
  if (!isPanelKey(input.panelKey)) {
    throw new CommerceError("Panel no válido: whm, plesk, directadmin o none.", 400);
  }
  return db.$transaction(async (tx) => {
    const service = await tx.customerService.findUnique({
      where: { id: input.serviceId },
    });
    if (!service) throw new CommerceError("Servicio no encontrado.", 404);
    if ((service.panelKey ?? "whm") === input.panelKey) {
      throw new CommerceError("El servicio ya está en ese panel.", 409);
    }
    const updated = await tx.customerService.update({
      where: { id: service.id },
      data: {
        panelKey: input.panelKey,
        panelAccountId:
          input.panelKey === "whm" ? (service.cpanelUser ?? null) : null,
        note,
      },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "service.panel",
        entityId: service.id,
        details: sanitizeAudit(`${service.panelKey ?? "whm"}->${input.panelKey}`),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: "service.panel",
      resourceType: "service",
      resourceId: service.id,
      details: `${service.panelKey ?? "whm"}->${input.panelKey}`,
    });
    return updated;
  });
}

/**
 * Anula una factura que no se va a cobrar. No borra nada: la factura y el pedido
 * quedan en el histórico como anulados. Una factura con cobro confirmado no se anula.
 */
export async function voidInvoice(input: { actor: string; invoiceId: string; note: string }) {
  const note = input.note.trim();
  if (note.length < 8 || note.length > 500) {
    throw new CommerceError("Indica por qué se anula la factura.", 400);
  }
  return db.$transaction(async (tx) => {
    const invoice = await tx.customerInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { payment: true },
    });
    if (!invoice) throw new CommerceError("Factura no encontrada.", 404);
    if (invoice.payment) {
      throw new CommerceError("Una factura con cobro registrado no se puede anular.", 409);
    }
    if (invoice.status === "void") return invoice;
    const updated = await tx.customerInvoice.update({
      where: { id: invoice.id },
      data: { status: "void" },
    });
    await tx.customerOrder.update({
      where: { id: invoice.orderId },
      data: { status: "cancelled" },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "invoice.voided",
        entityId: invoice.id,
        details: sanitizeAudit(`number=${invoice.number};note=${note}`),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: "invoice.voided",
      resourceType: "invoice",
      resourceId: invoice.id,
      details: `number=${invoice.number}`,
    });
    return updated;
  });
}

/** Cierra o reabre un ticket desde el panel. */
export async function setTicketStatus(input: {
  actor: string;
  ticketId: string;
  status: "open" | "closed";
}) {
  return db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw new CommerceError("Ticket no encontrado.", 404);
    if (ticket.status === input.status) return ticket;
    if (input.status === "open" && ticket.status !== "closed") return ticket;
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: input.status },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: input.status === "closed" ? "ticket.closed" : "ticket.reopened",
        entityId: ticket.id,
        details: sanitizeAudit(`${ticket.status}->${input.status}`),
      },
    });
    await writeAuditLogTx(tx, {
      actorType: actorTypeFor(input.actor),
      actorId: input.actor,
      action: input.status === "closed" ? "ticket.closed" : "ticket.reopened",
      resourceType: "ticket",
      resourceId: ticket.id,
      details: `${ticket.status}->${input.status}`,
    });
    return updated;
  });
}

export async function createTicket(input: { userId: string; subject: string; body: string }) {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 4 || subject.length > 120 || body.length < 4 || body.length > 4000) {
    throw new CommerceError("Asunto o mensaje no válidos.", 400);
  }
  return db.supportTicket.create({
    data: {
      userId: input.userId,
      subject,
      status: "open",
      messages: { create: { author: "customer", body } },
    },
  });
}

export async function replyTicket(input: {
  ticketId: string;
  userId?: string;
  author: "customer" | "admin";
  body: string;
}) {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 4000) throw new CommerceError("Mensaje vacío.", 400);
  const ticket = await db.supportTicket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) throw new CommerceError("Ticket no encontrado.", 404);
  if (input.author === "customer" && ticket.userId !== input.userId) {
    throw new CommerceError("No puedes escribir en un ticket ajeno.", 403);
  }
  if (ticket.status === "closed") throw new CommerceError("El ticket está cerrado.", 409);
  return db.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, author: input.author, body },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: input.author === "admin" ? "answered" : "open" },
    });
    return message;
  });
}
