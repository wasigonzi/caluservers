import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketReplyForm } from "@/components/account/AccountForms";
import { requireCustomer } from "@/lib/account-data";
import { dateTime } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket" };

export default async function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  // El filtro por dueño va en la consulta: un ticket ajeno es un 404, no un 403.
  const ticket = await db.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  return (
    <>
      <p className="back-link">
        <Link href="/cuenta/tickets">← Soporte</Link>
      </p>
      <PageHeader
        eyebrow="TICKET"
        title={ticket.subject}
        description={`Abierto el ${dateTime(ticket.createdAt)}`}
      />
      <ol className="thread" aria-label="Conversación">
        {ticket.messages.map((message) => (
          <li
            key={message.id}
            className={message.author === "admin" ? "thread-msg" : "thread-msg thread-admin"}
          >
            <p className="thread-meta">
              <strong>{message.author === "admin" ? "Soporte" : "Tú"}</strong>
              <span className="muted">{dateTime(message.createdAt)}</span>
            </p>
            <p className="thread-body">{message.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status === "closed" ? (
        <p className="muted">
          Este ticket está cerrado. Si necesitas algo más,{" "}
          <Link className="row-link" href="/cuenta/tickets">
            abre uno nuevo
          </Link>
          .
        </p>
      ) : (
        <div className="panel">
          <TicketReplyForm ticketId={ticket.id} />
        </div>
      )}
    </>
  );
}
