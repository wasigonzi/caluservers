import { NextRequest, NextResponse } from "next/server";
import { CommerceError } from "@/lib/commerce";
import { customerSession } from "@/lib/customer-session";
import { finishPaypalCheckout, startPaypalCheckout } from "@/lib/paypal-checkout";
import { PaypalError, paypalReady } from "@/lib/paypal";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/** Abre el cobro (`action: "start"`) y lo cierra a la vuelta (`action: "capture"`). */
export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  const session = await customerSession();
  if (!session?.user.emailVerified) {
    return json({ ok: false, error: "Verifica tu correo antes de pagar." }, 401);
  }
  if (!paypalReady()) {
    return json(
      { ok: false, error: "El cobro con PayPal no está configurado todavía." },
      503,
    );
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body?.action || "");
    const invoiceId = String(body?.invoiceId || "");

    if (action === "start") {
      const result = await startPaypalCheckout({ invoiceId, userId: session.user.id });
      return json({ ok: true, ...result });
    }
    if (action === "capture") {
      const orderId = String(body?.orderId || "");
      const result = await finishPaypalCheckout({
        orderId,
        invoiceId,
        userId: session.user.id,
      });
      return json({ ok: true, ...result });
    }
    return json({ ok: false, error: "Acción no reconocida." }, 400);
  } catch (error) {
    if (error instanceof CommerceError) {
      return json({ ok: false, error: error.message }, error.status);
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
