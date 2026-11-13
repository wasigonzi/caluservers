import "server-only";
import { db } from "./db";
import { billingPolicy, CommerceError, recordGatewayPayment } from "./commerce";
import {
  capturePaypalOrder,
  createPaypalOrder,
  paypalReady,
  PaypalError,
} from "./paypal";
import { maybeAutoProvision } from "./whm-provision";

/**
 * Puente entre las facturas propias y PayPal.
 *
 * La factura manda: el importe, la moneda y el dueño salen de la base, nunca del
 * cliente. Lo único que viaja desde el navegador es el id de la factura y, en la
 * vuelta, el id de orden que PayPal puso en la URL.
 */

export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "").trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return "";
    return url.origin;
  } catch {
    return "";
  }
}

async function payableInvoice(invoiceId: string, userId: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(invoiceId)) {
    throw new CommerceError("Factura no válida.", 400);
  }
  const invoice = await db.customerInvoice.findUnique({
    where: { id: invoiceId },
    include: { payment: true, order: true },
  });
  if (!invoice || invoice.userId !== userId) {
    // No se distingue "no existe" de "no es tuya".
    throw new CommerceError("Factura no encontrada.", 404);
  }
  if (invoice.payment?.status === "confirmed") {
    throw new CommerceError("Esa factura ya está pagada.", 409);
  }
  if (invoice.status === "void") throw new CommerceError("La factura está anulada.", 409);
  const policy = billingPolicy();
  if (!policy.ok) throw new CommerceError(policy.error, 409);
  if (invoice.taxMode !== "none" || invoice.taxCents !== 0) {
    throw new CommerceError("La factura es una proforma no cobrable.", 409);
  }
  if (invoice.currency !== policy.currency) {
    throw new CommerceError("La moneda de la factura no coincide con la configurada.", 409);
  }
  return invoice;
}

export async function startPaypalCheckout(input: { invoiceId: string; userId: string }) {
  if (!paypalReady()) throw new PaypalError("unconfigured");
  const origin = siteOrigin();
  if (!origin) {
    throw new CommerceError(
      "Falta NEXT_PUBLIC_SITE_URL para volver del pago. No se abre el cobro sin una URL de retorno.",
      409,
    );
  }
  const invoice = await payableInvoice(input.invoiceId, input.userId);
  const order = await createPaypalOrder({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    description: `${invoice.order.planName} · ${invoice.number}`,
    amountCents: invoice.totalCents,
    currency: invoice.currency,
    returnUrl: `${origin}/cuenta/pago?invoice=${encodeURIComponent(invoice.id)}`,
    cancelUrl: `${origin}/cuenta?pago=cancelado`,
    brandName: "CaluServers",
  });
  await db.commerceEvent
    .create({
      data: {
        actor: input.userId,
        action: "payment.started",
        entityId: invoice.id,
        details: `provider=paypal;order=${order.id};cents=${invoice.totalCents}`,
      },
    })
    .catch(() => {
      // La traza no debe impedir el cobro; el pago queda registrado al capturar.
    });
  return { orderId: order.id, approveUrl: order.approveUrl, invoiceId: invoice.id };
}

/**
 * Captura la orden aprobada y registra el cobro.
 * La referencia de captura es única en la tabla: si el webhook llegó antes,
 * esta llamada devuelve el mismo cobro en lugar de duplicarlo.
 */
export async function finishPaypalCheckout(input: {
  orderId: string;
  userId: string;
  invoiceId: string;
}) {
  if (!paypalReady()) throw new PaypalError("unconfigured");
  const invoice = await db.customerInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { payment: true },
  });
  if (!invoice || invoice.userId !== input.userId) {
    throw new CommerceError("Factura no encontrada.", 404);
  }
  if (invoice.payment?.status === "confirmed") {
    return { paid: true, paymentId: invoice.payment.id, invoiceId: invoice.id };
  }
  const capture = await capturePaypalOrder(input.orderId);
  if (capture.invoiceId !== invoice.id) throw new PaypalError("mismatch");
  const payment = await recordGatewayPayment({
    invoiceId: invoice.id,
    providerRef: capture.captureId,
    amountCents: capture.amountCents,
    currency: capture.currency,
    source: "capture",
  });
  // El alta va después del cobro y nunca lo invalida.
  const provision = await maybeAutoProvision({ invoiceId: invoice.id, actor: "paypal" });
  return {
    paid: true,
    paymentId: payment.id,
    invoiceId: invoice.id,
    provisioned: provision.provisioned,
    provisionNote: provision.reason,
  };
}
