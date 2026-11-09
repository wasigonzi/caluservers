import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCommerceForms } from "@/components/admin/AdminCommerceForms";

export const dynamic = "force-dynamic";

export default async function CommerceAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [customers, invoices, services, tickets] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.customerInvoice.findMany({ include: { payment: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.customerService.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.supportTicket.findMany({ include: { messages: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <h1>Clientes propios</h1>
      <p className="muted">Confirmar un pago no activa el servicio. El alta es un paso aparte y manual. WHM no se llama desde aquí.</p>
      <h2>Clientes</h2>
      <ul>{customers.map((user) => <li key={user.id}>{user.email} · verificado {user.emailVerified ? "sí" : "no"}</li>)}</ul>
      <h2>Facturas</h2>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            {invoice.number} · {invoice.totalCents} {invoice.currency} · {invoice.status} · impuesto {invoice.taxMode}
            {invoice.payment ? ` · pago ${invoice.payment.status}` : " · sin pago"}
            {invoice.taxMode === "none" && !invoice.payment ? <AdminCommerceForms invoiceId={invoice.id} /> : null}
          </li>
        ))}
      </ul>
      <h2>Servicios</h2>
      <ul>
        {services.map((service) => (
          <li key={service.id}>{service.planName}: {service.status}. {service.note}{service.status === "pending_provision" ? <AdminCommerceForms serviceId={service.id} /> : null}</li>
        ))}
      </ul>
      <h2>Tickets</h2>
      <ul>
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            {ticket.subject} · {ticket.status}
            <ul>{ticket.messages.map((message) => <li key={message.id}>{message.author}: {message.body}</li>)}</ul>
            <AdminCommerceForms ticketId={ticket.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
