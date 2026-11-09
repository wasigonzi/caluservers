import { NextRequest, NextResponse } from "next/server";
import { customerSession } from "@/lib/customer-session";
import { markFixtureApproval, PaypalSandboxError } from "@/lib/paypal-checkout";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await customerSession();
  if (!session?.user.emailVerified) return NextResponse.json({ error: "La sesión no es válida." }, { status: 401 });
  try {
    const body = await req.json();
    const result = body?.result === "denied" || body?.result === "cancelled" ? body.result : "approved";
    const checkout = await markFixtureApproval({
      userId: session.user.id,
      paypalOrderId: String(body?.paypalOrderId || ""),
      result,
    });
    return NextResponse.json({ status: checkout.status, paypalOrderId: checkout.paypalOrderId });
  } catch (error) {
    if (error instanceof PaypalSandboxError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "No se pudo simular la aprobación." }, { status: 503 });
  }
}
