import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CommerceError, confirmManualPayment, replyTicket, setServiceStatus } from "@/lib/commerce";
import { trustedWrite } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor() {
  await requireAdmin();
  return process.env.ADMIN_EMAIL || "admin";
}

export async function POST(req: NextRequest) {
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let email = "admin";
  try {
    email = await actor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (body?.action === "confirm-payment") {
      const payment = await confirmManualPayment({
        actor: email,
        invoiceId: String(body.invoiceId || ""),
        note: String(body.note || ""),
      });
      return NextResponse.json({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
      });
    }
    if (body?.action === "service-status") {
      const service = await setServiceStatus({
        actor: email,
        serviceId: String(body.serviceId || ""),
        status: body.status,
        note: String(body.note || ""),
      });
      return NextResponse.json({ id: service.id, status: service.status });
    }
    if (body?.action === "reply-ticket") {
      const message = await replyTicket({
        ticketId: String(body.ticketId || ""),
        author: "admin",
        body: String(body.body || ""),
      });
      return NextResponse.json({ id: message.id });
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    if (error instanceof CommerceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "No se pudo completar la operación." }, { status: 503 });
  }
}
