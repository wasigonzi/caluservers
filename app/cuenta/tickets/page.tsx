import { redirect } from "next/navigation";
import { AccountFrame } from "@/components/account/AccountFrame";
import { TicketForm } from "@/components/account/AccountForms";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";
import { authorLabel, formatDateTime, ticketStatusLabel } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  const tickets = await db.supportTicket.findMany({
    where: { userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <AccountFrame
      kicker="Soporte"
      title="Tickets"
      lead="La conversación queda en esta cuenta. No se envía al portal anterior."
    >
      <section className="account-card glass">
        <h2>Abrir un ticket</h2>
        <TicketForm />
      </section>
      <section className="account-card glass" aria-labelledby="lista-tickets">
        <h2 id="lista-tickets">Tus tickets</h2>
        {tickets.length === 0 ? <p>Todavía no hay tickets.</p> : (
          <ul className="account-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <p><strong>{ticket.subject}</strong> · {ticketStatusLabel(ticket.status)}</p>
                <p className="muted"><time dateTime={ticket.updatedAt.toISOString()}>{formatDateTime(ticket.updatedAt)}</time></p>
                <ul>
                  {ticket.messages.map((message) => (
                    <li key={message.id}>{authorLabel(message.author)}: {message.body}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountFrame>
  );
}
