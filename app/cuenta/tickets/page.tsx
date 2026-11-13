import Link from "next/link";
import { redirect } from "next/navigation";
import { TicketForm } from "@/components/account/AccountForms";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TICKET_LABELS: Record<string, string> = {
  open: "esperando respuesta",
  answered: "respondido",
  closed: "cerrado",
};

export default async function TicketsPage() {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  const tickets = await db.supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <p>
        <Link href="/cuenta">← Tu cuenta</Link>
      </p>
      <h1>Tickets</h1>
      <p className="muted">La conversación queda en esta cuenta. No se envía al portal anterior.</p>
      {tickets.length ? (
        <ul>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/cuenta/tickets/${ticket.id}`}>{ticket.subject}</Link>:{" "}
              {TICKET_LABELS[ticket.status] ?? ticket.status}
            </li>
          ))}
        </ul>
      ) : null}
      <h2>Abrir un ticket nuevo</h2>
      <TicketForm />
    </main>
  );
}
