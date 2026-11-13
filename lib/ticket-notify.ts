import "server-only";
import { noticeRecipient } from "@/lib/contact-intake";
import { db } from "@/lib/db";
import { deliverNotice } from "@/lib/mailer";

/**
 * Avisos por correo de los tickets. Son un extra: el mensaje ya está guardado
 * cuando se llaman, y un fallo de correo nunca rompe la respuesta.
 * El correo no lleva el contenido del ticket, solo el enlace para leerlo con sesión.
 */

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
}

/** Avisa al cliente de que el equipo respondió. Devuelve si el correo salió. */
export async function notifyCustomerOfReply(ticketId: string): Promise<boolean> {
  try {
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, subject: true, user: { select: { email: true } } },
    });
    if (!ticket?.user.email) return false;
    const base = siteUrl();
    const result = await deliverNotice({
      to: ticket.user.email,
      subject: `Respuesta a tu ticket: ${ticket.subject}`,
      text: [
        "El equipo de soporte respondió a tu ticket.",
        base ? `Léelo y responde aquí: ${base}/cuenta/tickets/${ticket.id}` : "Entra en tu cuenta para leerlo.",
      ].join("\n"),
    });
    return result.delivered;
  } catch {
    return false;
  }
}

/** Avisa al buzón interno de un ticket nuevo o de una respuesta del cliente. */
export async function notifyStaffOfTicket(ticketId: string, kind: "new" | "reply"): Promise<boolean> {
  try {
    const to = await noticeRecipient();
    if (!to) return false;
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, subject: true, user: { select: { email: true } } },
    });
    if (!ticket) return false;
    const base = siteUrl();
    const result = await deliverNotice({
      to,
      subject: `${kind === "new" ? "Ticket nuevo" : "Respuesta del cliente"}: ${ticket.subject}`,
      text: [
        `Cliente: ${ticket.user.email}`,
        base ? `Ábrelo en el panel: ${base}/admin/tickets/${ticket.id}` : "Ábrelo en el panel de administración.",
      ].join("\n"),
      replyTo: ticket.user.email,
    });
    return result.delivered;
  } catch {
    return false;
  }
}
