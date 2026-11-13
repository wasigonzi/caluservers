import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CommerceError, confirmManualPayment, replyTicket, setServiceStatus } from "@/lib/commerce";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import { WhmError, safeWhmError } from "@/lib/whm-security";
import { maybeAutoProvision, ProvisionError, provisionService } from "@/lib/whm-provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

async function actor() {
  await requireAdmin();
  return process.env.ADMIN_EMAIL || "admin";
}

const MESSAGE_STATES = ["new", "read", "archived"] as const;

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
      // Si el alta automática está activa, se intenta; un fallo no deshace el cobro.
      const provision = await maybeAutoProvision({
        invoiceId: payment.invoiceId,
        actor: email,
      });
      return NextResponse.json({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provisioned: provision.provisioned,
        provisionNote: provision.reason,
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
    if (body?.action === "provision-service") {
      const result = await provisionService({
        actor: email,
        serviceId: String(body.serviceId || ""),
      });
      return NextResponse.json(result);
    }
    if (body?.action === "reply-ticket") {
      const message = await replyTicket({
        ticketId: String(body.ticketId || ""),
        author: "admin",
        body: String(body.body || ""),
      });
      return NextResponse.json({ id: message.id });
    }
    if (body?.action === "message-status") {
      const status = String(body.status || "");
      const id = String(body.messageId || "");
      if (!(MESSAGE_STATES as readonly string[]).includes(status) || !id) {
        return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
      }
      const updated = await db.contactMessage.update({
        where: { id },
        data: { status },
        select: { id: true, status: true },
      });
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    if (error instanceof CommerceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ProvisionError) {
      // Falta configuración o el servicio no está en el estado correcto.
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "notfound" ? 404 : 409 },
      );
    }
    if (error instanceof WhmError) {
      const safe = safeWhmError(error);
      return NextResponse.json({ error: safe.message, code: safe.code }, { status: 502 });
    }
    return NextResponse.json({ error: "No se pudo completar la operación." }, { status: 503 });
  }
}
