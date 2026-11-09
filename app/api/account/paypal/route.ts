import { NextRequest, NextResponse } from "next/server";
import { customerSession } from "@/lib/customer-session";
import { createPaypalCheckout, PaypalSandboxError } from "@/lib/paypal-checkout";
import { formatMinorAmount } from "@/lib/money";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await customerSession();
  if (!session?.user.emailVerified) return NextResponse.json({ error: "Debes entrar con el correo verificado." }, { status: 401 });
  try {
    const body = await req.json();
    const checkout = await createPaypalCheckout({
      userId: session.user.id,
      invoiceId: String(body?.invoiceId || ""),
      idempotencyKey: String(body?.idempotencyKey || ""),
    });
    return NextResponse.json({
      id: checkout.id,
      paypalOrderId: checkout.paypalOrderId,
      approveUrl: checkout.approveUrl,
      status: checkout.status,
      formattedTotal: formatMinorAmount(checkout.amountCents, checkout.currency),
      testFiscal: checkout.testFiscal,
      mode: "sandbox",
    });
  } catch (error) {
    if (error instanceof PaypalSandboxError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "No se pudo iniciar el checkout de prueba." }, { status: 503 });
  }
}
