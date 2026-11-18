import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { dateTime, formatBytes, ticketStatus } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { TicketAttachmentForm, TicketReplyForm, TicketStatusButton } from "@/components/admin/CommerceActions";
import { PageHeader, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: true,
      messages: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();
  const closed = ticket.status === "closed";

  return (
    <>
      <p className="back-link">
        <Link href="/admin/tickets">← Tickets</Link>
      </p>
      <PageHeader
        eyebrow="TICKET"
        title={ticket.subject}
        description={
          <>
            <Link className="row-link" href={`/admin/clientes/${ticket.userId}`}>
              {ticket.user.name || ticket.user.email}
            </Link>{" "}
            · {ticket.user.email} · abierto el {dateTime(ticket.createdAt)}
          </>
        }
      >
        <StatusBadge info={ticketStatus(ticket.status)} />
        <TicketStatusButton ticketId={ticket.id} status={closed ? "open" : "closed"} />
      </PageHeader>

      <ol className="thread" aria-label="Conversación">
        {ticket.messages.map((message) => (
          <li
            key={message.id}
            className={message.author === "admin" ? "thread-msg thread-admin" : "thread-msg"}
          >
            <p className="thread-meta">
              <strong>{message.author === "admin" ? "Soporte" : ticket.user.name || "Cliente"}</strong>
              <span className="muted">{dateTime(message.createdAt)}</span>
            </p>
            <p className="thread-body">{message.body}</p>
          </li>
        ))}
      </ol>

      {closed ? (
        <p className="muted">El ticket está cerrado. Reábrelo para responder.</p>
      ) : (
        <div className="panel">
          <TicketReplyForm ticketId={ticket.id} />
        </div>
      )}

      <section className="panel" aria-label="Adjuntos">
        <h2>Adjuntos ({ticket.attachments.length})</h2>
        {ticket.attachments.length === 0 ? (
          <p className="muted">
            Sin adjuntos. Máx. 10 MB por archivo: imágenes, PDF, TXT o ZIP.
          </p>
        ) : (
          <ul>
            {ticket.attachments.map((attachment) => (
              <li key={attachment.id}>
                <a href={`/api/tickets/attachments/${attachment.id}`}>
                  {attachment.fileName}
                </a>{" "}
                <span className="muted">
                  · {formatBytes(attachment.sizeBytes)} · {dateTime(attachment.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {closed ? null : <TicketAttachmentForm ticketId={ticket.id} />}
      </section>
    </>
  );
}
