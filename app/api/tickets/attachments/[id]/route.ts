import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";
import {
  canAccessTicketAttachment,
  readTicketAttachment,
} from "@/lib/ticket-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga de un adjunto de ticket (Fase 5, frente C). Solo quien tenga
 * acceso al ticket: cliente dueño o admin con `tickets:reply`. Cualquier
 * otro caso —incluido un adjunto inexistente— responde 404, para no
 * confirmar que el adjunto existe.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let attachment;
  try {
    attachment = await db.ticketAttachment.findUnique({
      where: { id },
      include: { ticket: { select: { userId: true } } },
    });
  } catch {
    return new NextResponse("No encontrado.", { status: 404 });
  }
  if (!attachment) return new NextResponse("No encontrado.", { status: 404 });

  let allowed = false;
  try {
    const admin = await getAdminSession();
    if (admin?.permissions.includes("tickets:reply")) allowed = true;
  } catch {
    // Sin sesión de admin se prueba la de cliente.
  }
  if (!allowed) {
    const customer = await customerSession().catch(() => null);
    allowed = canAccessTicketAttachment(
      { adminWithReply: false, customerUserId: customer?.user?.id ?? null },
      { userId: attachment.ticket.userId },
    );
  }
  if (!allowed) return new NextResponse("No encontrado.", { status: 404 });

  const bytes = await readTicketAttachment(attachment);
  if (!bytes) return new NextResponse("No encontrado.", { status: 404 });
  const safeName = attachment.fileName.replace(/["\\\r\n]/g, "_");
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
