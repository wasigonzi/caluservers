import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/account/AccountForms";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

export default async function AccountHome() {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  const [orders, invoices, services, tickets] = await Promise.all([
    db.customerOrder.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
    db.customerInvoice.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
    db.customerService.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
    db.supportTicket.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Tu cuenta</h1>
      <p className="muted">{session.user.email}</p>
      <SignOutButton />
      <h2>Pedidos</h2>
      <ul>{orders.map((order) => <li key={order.id}>{order.planName}: {order.totalCents} {order.currency} · {order.status}</li>)}</ul>
      <h2>Facturas</h2>
      <ul>{invoices.map((invoice) => <li key={invoice.id}>{invoice.number}: {invoice.totalCents} {invoice.currency} · {invoice.status} · impuesto {invoice.taxMode}</li>)}</ul>
      <h2>Servicios</h2>
      <ul>{services.map((service) => <li key={service.id}>{service.planName}: {service.status}. {service.note}</li>)}</ul>
      <h2>Tickets</h2>
      <ul>{tickets.map((ticket) => <li key={ticket.id}>{ticket.subject}: {ticket.status}</li>)}</ul>
      <p><Link href="/cuenta/tickets">Abrir un ticket</Link> · <Link href="/web-hosting">Ver planes</Link></p>
    </main>
  );
}
