import { NextRequest, NextResponse } from "next/server";
import { CommerceError, recordGatewayPayment } from "@/lib/commerce";
import { writeAuditLog } from "@/lib/audit-log";
import { db } from "@/lib/db";
import { handleGatewayWebhook } from "@/lib/gateways";
import { StripeError, ensureStripeBillingSubscription } from "@/lib/stripe";
import { maybeAutoProvision } from "@/lib/whm-provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const BODY_LIMIT = 256 * 1024;

/** Estado de Subscription que corresponde a cada estado de Stripe. */
const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "cancelled",
  incomplete: "past_due",
  incomplete_expired: "cancelled",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Webhook de Stripe. No lo protege el mismo origen (lo llama Stripe, no el
 * navegador): lo protege la verificación de firma con `STRIPE_WEBHOOK_SECRET`.
 * Sin ese secreto no se acepta ningún evento y sin firma válida no se
 * registra nada. El cuerpo se lee en crudo, sin parsear, porque la firma
 * se calcula sobre los bytes tal cual llegaron.
 */
export async function POST(req: NextRequest) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ ok: false, error: "Evento no legible." }, 400);
  }
  if (!raw) return json({ ok: false, error: "Evento vacío." }, 400);
  if (raw.length > BODY_LIMIT) {
    return json({ ok: false, error: "Evento demasiado grande." }, 413);
  }

  let event;
  try {
    event = await handleGatewayWebhook({
      gatewayKey: "stripe",
      rawBody: raw,
      headers: req.headers,
    });
  } catch (error) {
    if (error instanceof StripeError) {
      if (error.code === "unconfigured") {
        return json({ ok: false, error: error.message }, 503);
      }
      if (error.code === "signature") {
        return json({ ok: false, error: error.message }, 400);
      }
      return json({ ok: false, error: error.message }, 502);
    }
    if (error instanceof CommerceError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    return json({ ok: false, error: "No se pudo verificar el evento." }, 503);
  }

  try {
    if (event.type === "payment") {
      const payment = await recordGatewayPayment({
        invoiceId: event.invoiceId,
        provider: "stripe",
        providerRef: event.providerRef,
        amountCents: event.amountCents,
        currency: event.currency,
        source: "webhook",
      });
      // Conecta la suscripción local con Stripe Billing (idempotente; si la
      // vuelta del cliente ya la conectó, no hace nada). Sin esto el cron
      // no podría cobrar renovaciones con el método guardado.
      await ensureStripeBillingSubscription({ invoiceId: event.invoiceId });
      // El alta se intenta aquí también: si el cliente cerró la pestaña, el webhook la cubre.
      const provision = await maybeAutoProvision({
        invoiceId: event.invoiceId,
        actor: "stripe-webhook",
      });
      return json({ ok: true, paymentId: payment.id, provisioned: provision.provisioned });
    }
    if (event.type === "payment_failed") {
      if (event.gatewaySubscriptionId) {
        await db.subscription.updateMany({
          where: { gatewaySubscriptionId: event.gatewaySubscriptionId },
          data: { status: "past_due" },
        });
      }
      return json({ ok: true, ignored: "payment_failed" });
    }
    if (event.type === "subscription_updated") {
      const status = SUBSCRIPTION_STATUS[event.status] ?? event.status;
      await db.subscription.updateMany({
        where: { gatewaySubscriptionId: event.gatewaySubscriptionId },
        data: { status },
      });
      return json({ ok: true, ignored: "subscription_updated" });
    }
    if (event.type === "subscription_deleted") {
      await db.subscription.updateMany({
        where: { gatewaySubscriptionId: event.gatewaySubscriptionId },
        data: { status: "cancelled" },
      });
      return json({ ok: true, ignored: "subscription_deleted" });
    }
    if (event.type === "refunded") {
      // Solo se deja constancia: el reembolso ya lo hizo Stripe y no se
      // reembolsa dos veces. El cambio de estado del cobro lo hace el admin.
      await db.commerceEvent.create({
        data: {
          actor: "stripe",
          action: "payment.refunded",
          entityId: event.providerRef,
          details: `stripe-charge=${event.providerRef};cents=${event.amountCents};currency=${event.currency}`,
        },
      });
      // Doble escritura (Fase 6): también a AuditLog, mejor esfuerzo.
      void writeAuditLog({
        actorType: "system",
        actorId: "stripe",
        action: "payment.refunded",
        resourceType: "payment",
        resourceId: event.providerRef,
        details: `stripe-charge=${event.providerRef};cents=${event.amountCents};currency=${event.currency}`,
      });
      return json({ ok: true, ignored: "refunded" });
    }
    // Evento legítimo que no mueve dinero: se confirma para que Stripe no reintente.
    return json({ ok: true, ignored: event.gatewayType || "unknown" });
  } catch (error) {
    if (error instanceof CommerceError) {
      // Importe o factura que no cuadran: no se registra y no se pide reintento.
      return json({ ok: false, error: error.message }, error.status === 404 ? 404 : 409);
    }
    // Fallo de base: 503 para que Stripe reintente el mismo evento.
    return json({ ok: false, error: "No se pudo registrar el cobro." }, 503);
  }
}
