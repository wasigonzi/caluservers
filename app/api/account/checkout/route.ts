import { NextRequest, NextResponse } from "next/server";
import { CommerceError } from "@/lib/commerce";
import { customerSession } from "@/lib/customer-session";
import { availableGateways, startCheckout } from "@/lib/gateways";
import { PaypalError } from "@/lib/paypal";
import { StripeError, finishStripeCheckout } from "@/lib/stripe";
import { trustedWrite } from "@/lib/request";
import { maybeAutoProvision } from "@/lib/whm-provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Checkout por pasarela elegida. El cliente solo elige la pasarela y la
 * factura: el importe, la moneda y el dueño los decide el servidor desde
 * la base. La transferencia no abre ninguna pasarela: devuelve las
 * instrucciones y el pedido queda pendiente de confirmación manual.
 */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  const session = await customerSession();
  if (!session?.user) {
    return json({ ok: false, error: "Debes entrar para pagar." }, 401);
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body?.action || "");
    const invoiceId = String(body?.invoiceId || "");

    if (action === "gateways") {
      const gateways = await availableGateways();
      return json({ ok: true, gateways });
    }
    if (action === "start") {
      const gatewayKey = String(body?.gateway || "");
      const result = await startCheckout({
        gatewayKey,
        invoiceId,
        userId: session.user.id,
      });
      return json({ ok: true, ...result });
    }
    if (action === "capture") {
      if (String(body?.gateway || "") !== "stripe") {
        return json({ ok: false, error: "Pasarela no reconocida." }, 400);
      }
      const sessionId = String(body?.sessionId || "");
      const result = await finishStripeCheckout({
        sessionId,
        invoiceId,
        userId: session.user.id,
      });
      // El alta va después del cobro y nunca lo invalida.
      const provision = await maybeAutoProvision({
        invoiceId: result.invoiceId,
        actor: "stripe",
      });
      return json({
        ok: true,
        ...result,
        provisioned: provision.provisioned,
        provisionNote: provision.reason,
      });
    }
    return json({ ok: false, error: "Acción no reconocida." }, 400);
  } catch (error) {
    if (error instanceof CommerceError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    if (error instanceof StripeError) {
      return json(
        { ok: false, error: error.message },
        error.code === "unconfigured" ? 503 : 502,
      );
    }
    if (error instanceof PaypalError) {
      return json(
        { ok: false, error: error.message },
        error.code === "unconfigured" ? 503 : 502,
      );
    }
    return json({ ok: false, error: "No se pudo completar el cobro." }, 503);
  }
}
