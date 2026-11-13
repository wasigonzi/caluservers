import Link from "next/link";
import { TicketForm } from "@/components/account/AccountForms";
import { requireCustomer } from "@/lib/account-data";
import { dateTime, type StatusInfo } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soporte" };

/** Desde el lado del cliente, «respondido» es lo que pide su atención. */
const STATUS: Record<string, StatusInfo> = {
  open: { label: "Esperando respuesta", tone: "info" },
  answered: { label: "Respondido", tone: "warn" },
  closed: { label: "Cerrado", tone: "muted" },
};

export default async function TicketsPage() {
  const user = await requireCustomer();
  const tickets = await db.supportTicket.findMany({
    where: { userId: user.id },
    include: { _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title="Soporte"
        description="Escríbenos y sigue la conversación aquí. Te avisamos por correo cuando respondamos."
      />
      <div className="dash-columns account-support">
        <section className="panel" aria-labelledby="tickets-list">
          <h2 id="tickets-list">Tus tickets</h2>
          {tickets.length ? (
            <ul className="plain-list">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <span>
                    <Link className="row-link" href={`/cuenta/tickets/${ticket.id}`}>
                      {ticket.subject}
                    </Link>
                    <span className="cell-sub">
                      {ticket._count.messages} {ticket._count.messages === 1 ? "mensaje" : "mensajes"} ·{" "}
                      {dateTime(ticket.updatedAt)}
                    </span>
                  </span>
                  <span className="muted">
                    <StatusBadge info={STATUS[ticket.status] ?? { label: ticket.status, tone: "muted" }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No has abierto ningún ticket." />
          )}
        </section>
        <section className="panel" aria-labelledby="tickets-new">
          <h2 id="tickets-new">Abrir un ticket nuevo</h2>
          <TicketForm />
        </section>
      </div>
    </>
  );
}
