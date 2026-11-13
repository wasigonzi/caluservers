import { NextRequest, NextResponse } from "next/server";
import { CommerceError, recordGatewayPayment } from "@/lib/commerce";
import {
  PaypalError,
  paypalWebhookReady,
  readCapture,
  readWebhookHeaders,
  verifyWebhook,
} from "@/lib/paypal";
import { maybeAutoProvision } from "@/lib/whm-provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const BODY_LIMIT = 256 * 1024;

/** Eventos que registran un cobro. El resto se acepta y se ignora. */
const PAID_EVENTS = new Set(["PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Webhook de PayPal. No lo protege el mismo origen (lo llama PayPal, no el
 * navegador): lo protege la verificación de firma contra la API de PayPal con
 * `PAYPAL_WEBHOOK_ID`. Sin esa variable no se acepta ningún evento.
 */
export async function POST(req: NextRequest) {
  if (!paypalWebhookReady()) {
    return json({ ok: false, error: "Webhook no configurado." }, 503);
  }
  const headers = readWebhookHeaders(req.headers);
  if (!headers) return json({ ok: false, error: "Cabeceras incompletas." }, 400);

  let raw: string;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("empty");
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        return json({ ok: false, error: "Evento demasiado grande." }, 413);
      }
      parts.push(value);
    }
    raw = Buffer.concat(parts).toString("utf8");
  } catch {
    return json({ ok: false, error: "Evento no legible." }, 400);
  }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    event = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Evento no válido." }, 400);
  }

  let verified = false;
  try {
    verified = await verifyWebhook({ headers, event });
  } catch (error) {
    if (error instanceof PaypalError && error.code === "unconfigured") {
      return json({ ok: false, error: error.message }, 503);
    }
    // No se pudo verificar: PayPal reintenta. Nunca se registra sin verificar.
    return json({ ok: false, error: "Verificación no disponible." }, 503);
  }
  if (!verified) return json({ ok: false, error: "Firma no válida." }, 400);

  const type = typeof event.event_type === "string" ? event.event_type : "";
  if (!PAID_EVENTS.has(type)) {
    // Evento legítimo que no mueve dinero: se confirma para que PayPal no reintente.
    return json({ ok: true, ignored: type || "unknown" });
  }

  const resource = event.resource;
  // PAYMENT.CAPTURE.COMPLETED trae la captura suelta; CHECKOUT.ORDER.COMPLETED, la orden.
  const capture =
    readCapture(resource) ??
    readCapture({
      purchase_units: [
        {
          custom_id: (resource as { custom_id?: unknown } | null)?.custom_id,
          payments: { captures: [resource] },
        },
      ],
    });
  if (!capture) return json({ ok: true, ignored: "sin-captura" });

  try {
    const payment = await recordGatewayPayment({
      invoiceId: capture.invoiceId,
      providerRef: capture.captureId,
      amountCents: capture.amountCents,
      currency: capture.currency,
      source: "webhook",
    });
    // El alta se intenta aquí también: si el cliente cerró la pestaña, el webhook la cubre.
    const provision = await maybeAutoProvision({
      invoiceId: capture.invoiceId,
      actor: "paypal-webhook",
    });
    return json({ ok: true, paymentId: payment.id, provisioned: provision.provisioned });
  } catch (error) {
    if (error instanceof CommerceError) {
      // Importe o factura que no cuadran: no se registra y no se pide reintento.
      return json({ ok: false, error: error.message }, error.status === 404 ? 404 : 409);
    }
    // Fallo de base: 503 para que PayPal reintente el mismo evento.
    return json({ ok: false, error: "No se pudo registrar el cobro." }, 503);
  }
}
