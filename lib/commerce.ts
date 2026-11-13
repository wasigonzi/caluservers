import { parseCatalogPayload, seedCatalogPayload } from "./catalog-validate";
import { db } from "./db";
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

export async function createCustomerOrder(input: {
  userId: string;
  planId: string;
  idempotencyKey: string;
  domain?: string;
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
    const order = await tx.customerOrder.create({
      data: {
        userId: input.userId,
        idempotencyKey: key,
        planId: plan.id,
        planName: plan.name,
        domain,
        currency,
        totalCents: unitCents,
        status: "submitted",
        lines: {
          create: {
            planId: plan.id,
            description: `${plan.name} · ciclo mensual`,
            quantity: 1,
            unitCents,
            totalCents: unitCents,
          },
        },
      },
    });
    const invoice = await tx.customerInvoice.create({
      data: {
        userId: input.userId,
        orderId: order.id,
        number: `PF-${order.id.slice(-8).toUpperCase()}`,
        currency,
        subtotalCents: unitCents,
        taxMode,
        taxCents,
        totalCents: unitCents,
        status: payable ? "issued" : "proforma",
        lines: {
          create: {
            description: `${plan.name} · ciclo mensual`,
            quantity: 1,
            unitCents,
            totalCents: unitCents,
          },
        },
      },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.userId,
        action: "order.created",
        entityId: order.id,
        details: `plan=${plan.id};cents=${unitCents};currency=${currency};tax=${taxMode};domain=${domain ?? "-"}`,
      },
    });
    return { ...order, invoice };
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
  provider: "manual" | "paypal";
  providerRef?: string;
  /** Importe cobrado de verdad. La pasarela lo aporta; el manual usa el de la factura. */
  paidCents?: number;
  paidCurrency?: string;
  serviceNote: string;
}) {
  const policy = billingPolicy();
  if (!policy.ok) throw new CommerceError(policy.error, 409);
  return db.$transaction(async (tx) => {
    const invoice = await tx.customerInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { payment: true, order: true },
    });
    if (!invoice) throw new CommerceError("Factura no encontrada.", 404);
    if (invoice.payment?.status === "confirmed") return invoice.payment;
    if (invoice.status === "void") throw new CommerceError("La factura está anulada.", 409);
    if (invoice.taxMode !== "none" || invoice.taxCents !== 0) {
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
    await tx.customerInvoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    await tx.customerService.create({
      data: {
        userId: invoice.userId,
        orderId: invoice.orderId,
        planId: invoice.order.planId,
        planName: invoice.order.planName,
        status: "pending_provision",
        note: input.serviceNote,
      },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "payment.confirmed",
        entityId: payment.id,
        details: `invoice=${invoice.id};cents=${payment.amountCents};currency=${payment.currency};provider=${input.provider}`,
      },
    });
    return payment;
  });
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

export async function confirmManualPayment(input: {
  actor: string;
  invoiceId: string;
  note: string;
}) {
  const note = input.note.trim();
  if (note.length < 8 || note.length > 500) {
    throw new CommerceError("La nota de confirmación debe explicar el cobro recibido.", 400);
  }
  return recordPayment({
    actor: input.actor,
    invoiceId: input.invoiceId,
    note,
    provider: "manual",
    serviceNote: "Pago confirmado por un administrador. Falta el alta del servicio.",
  });
}

/**
 * Registra una captura de PayPal ya verificada. `providerRef` es el id de captura:
 * es único en la tabla, así que un webhook repetido no duplica el cobro.
 */
export async function recordGatewayPayment(input: {
  invoiceId: string;
  providerRef: string;
  amountCents: number;
  currency: string;
  source: "capture" | "webhook";
}) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(input.providerRef)) {
    throw new CommerceError("La referencia de la pasarela no es válida.", 400);
  }
  const already = await db.payment.findUnique({
    where: { providerRef: input.providerRef },
  });
  if (already) return already;
  try {
    return await recordPayment({
      actor: "paypal",
      invoiceId: input.invoiceId,
      note: `Cobro con PayPal (${input.source}). Captura ${input.providerRef}.`,
      provider: "paypal",
      providerRef: input.providerRef,
      paidCents: input.amountCents,
      paidCurrency: input.currency,
      serviceNote: "Pago recibido por PayPal. Pendiente de alta del servicio.",
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
      if (service.status !== "pending_provision") {
        throw new CommerceError("Solo un servicio pendiente de alta puede activarse.", 409);
      }
    }
    if (input.status === "pending_provision" && service.status === "active") {
      throw new CommerceError("No se puede devolver un servicio activo a pendiente.", 409);
    }
    const updated = await tx.customerService.update({
      where: { id: service.id },
      data: { status: input.status, note },
    });
    await tx.commerceEvent.create({
      data: {
        actor: input.actor,
        action: "service.status",
        entityId: service.id,
        details: `${service.status}->${input.status}`,
      },
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
