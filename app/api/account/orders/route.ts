import { NextRequest, NextResponse } from "next/server";
import { CommerceError, createCustomerOrder } from "@/lib/commerce";
import { customerSession } from "@/lib/customer-session";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await customerSession();
  if (!session?.user.emailVerified) {
    return NextResponse.json({ error: "Debes verificar el correo antes de contratar." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const order = await createCustomerOrder({
      userId: session.user.id,
      planId: String(body?.planId || ""),
      idempotencyKey: String(body?.idempotencyKey || ""),
      domain: String(body?.domain || ""),
    });
    return NextResponse.json({
      id: order.id,
      totalCents: order.totalCents,
      currency: order.currency,
      invoiceId: order.invoice?.id ?? null,
    });
  } catch (error) {
    if (error instanceof CommerceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "No se pudo crear el pedido." }, { status: 503 });
  }
}
