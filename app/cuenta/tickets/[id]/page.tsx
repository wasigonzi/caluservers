import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TicketReplyForm } from "@/components/account/AccountForms";
import { customerSession } from "@/lib/customer-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function when(date: Date) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  const { id } = await params;
  // El filtro por dueño va en la consulta: un ticket ajeno es un 404, no un 403.
  const ticket = await db.supportTicket.findFirst({
    where: { id, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <p>
        <Link href="/cuenta/tickets">← Tickets</Link>
      </p>
      <h1>{ticket.subject}</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {ticket.messages.map((message) => (
          <li key={message.id} className="glass" style={{ padding: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{message.author === "admin" ? "Soporte" : "Tú"}</strong> ·{" "}
              {when(message.createdAt)}
            </p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "8px 0 0" }}>
              {message.body}
            </p>
          </li>
        ))}
      </ul>
      {ticket.status === "closed" ? (
        <p className="notice">
          Este ticket está cerrado. Si necesitas algo más,{" "}
          <Link href="/cuenta/tickets">abre uno nuevo</Link>.
        </p>
      ) : (
        <TicketReplyForm ticketId={ticket.id} />
      )}
    </main>
  );
}
