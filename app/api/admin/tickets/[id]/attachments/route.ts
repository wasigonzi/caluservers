import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { trustedWrite } from "@/lib/request";
import {
  AttachmentError,
  attachmentStorageAvailable,
  publicAttachment,
  saveTicketAttachment,
} from "@/lib/ticket-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subida de adjuntos por el agente (Fase 5, frente C). Exige
 * `tickets:reply`. Campo `file` (multipart). Límite 10 MB; solo imágenes,
 * PDF, TXT y ZIP. Sin TICKET_ATTACHMENTS_DIR se rechaza con 503 y un
 * mensaje honesto: no se guarda nada en disco sin control.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requirePermission("tickets:reply");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sin permiso para responder tickets." }, { status: 403 });
    }
    return NextResponse.json({ error: "Debes entrar como administrador." }, { status: 401 });
  }
  if (!trustedWrite(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: ticketId } = await params;
  let ticket;
  try {
    ticket = await db.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el ticket." }, { status: 503 });
  }
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  if (!attachmentStorageAvailable()) {
    return NextResponse.json(
      { error: "La subida de adjuntos no está configurada en este servidor. No se guardó ningún archivo." },
      { status: 503 },
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }
  const messageId = form.get("messageId");
  try {
    const row = await saveTicketAttachment({
      ticketId,
      messageId: typeof messageId === "string" && messageId ? messageId : null,
      fileName: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      uploadedBy: session.email,
    });
    return NextResponse.json({ ok: true, attachment: publicAttachment(row) }, { status: 201 });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "No se pudo guardar el adjunto." }, { status: 503 });
  }
}
