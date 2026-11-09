import { NextRequest, NextResponse } from "next/server";
import { customerSession } from "@/lib/customer-session";
import { confirmPaypalCheckout, PaypalSandboxError } from "@/lib/paypal-checkout";
import { formatMinorAmount } from "@/lib/money";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await customerSession();
  if (!session?.user.emailVerified) return NextResponse.json({ error: "La sesión no es válida." }, { status: 401 });
  try {
    const body = await req.json();
    const checkout = await confirmPaypalCheckout({
      userId: session.user.id,
      paypalOrderId: String(body?.paypalOrderId || ""),
    });
    const proved = checkout.status === "captured";
    return NextResponse.json({
      status: checkout.status,
      formattedTotal: formatMinorAmount(checkout.amountCents, checkout.currency),
      message: proved
        ? `PRUEBAS · sin dinero real. El servidor confirmó ${formatMinorAmount(checkout.amountCents, checkout.currency)}. La factura sigue en proforma y el servicio queda pendiente de alta manual.`
        : "PRUEBAS · sin dinero real. El servidor aún no ha confirmado la captura.",
    });
  } catch (error) {
    if (error instanceof PaypalSandboxError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "No se pudo confirmar el pago de prueba." }, { status: 503 });
  }
}
