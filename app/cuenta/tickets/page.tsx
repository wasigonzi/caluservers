import { redirect } from "next/navigation";
import { TicketForm } from "@/components/account/AccountForms";
import { customerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Tickets</h1>
      <p className="muted">La conversación queda en esta cuenta. No se envía al portal anterior.</p>
      <TicketForm />
    </main>
  );
}
