import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCommerceForms } from "@/components/admin/AdminCommerceForms";
import { billingPolicy } from "@/lib/commerce";
import {
  EXPLICIT_TAX_ENVIRONMENT_NOTE,
  ISSUER_CONTEXT,
  MISSING_TAX_POLICY_ERROR,
  WHM_ACTIVATION_NOTE,
  authorLabel,
  formatDateTime,
  formatMinorAmount,
  invoiceStatusLabel,
  paymentStatusLabel,
  serviceStatusLabel,
  taxModeLabel,
  ticketStatusLabel,
} from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CommerceAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const policy = billingPolicy();
  const [customers, invoices, services, tickets] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.customerInvoice.findMany({ include: { payment: true, order: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.customerService.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.supportTicket.findMany({ include: { messages: { orderBy: { createdAt: "asc" } }, user: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <header className="dashboard-heading">
        <div>
          <p className="studio-eyebrow">CLIENTES PROPIOS</p>
          <h1>Pedidos y facturas</h1>
          <p className="muted">Los importes se leen en dólares. Confirmar un pago, cuando la política fiscal lo permita, no activa el servicio ni llama a WHM.</p>
        </div>
      </header>
      <div className="fiscal-callout">
        <p>{ISSUER_CONTEXT}</p>
        <p>{policy.ok ? EXPLICIT_TAX_ENVIRONMENT_NOTE : MISSING_TAX_POLICY_ERROR}</p>
      </div>
      <section className="glass admin-card" aria-labelledby="clientes-titulo">
        <h2 id="clientes-titulo">Clientes</h2>
        {customers.length === 0 ? <p>Todavía no hay clientes.</p> : (
          <div className="table-wrap">
            <table className="commerce-table account-table">
              <caption>Cuentas registradas en este sitio</caption>
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Verificación</th>
                  <th scope="col">Alta</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Correo">{user.email}</td>
                    <td data-label="Verificación">{user.emailVerified ? "Correo verificado" : "Correo sin verificar"}</td>
                    <td data-label="Alta"><time dateTime={user.createdAt.toISOString()}>{formatDateTime(user.createdAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="glass admin-card" aria-labelledby="facturas-admin-titulo">
        <h2 id="facturas-admin-titulo">Facturas</h2>
        {invoices.length === 0 ? <p>Todavía no hay facturas.</p> : (
          <div className="table-wrap">
            <table className="commerce-table account-table">
              <caption>Proformas y facturas. El prefijo PF es proforma; FA solo aparece si el entorno tiene política fiscal explícita.</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Impuesto</th>
                  <th scope="col">Pago</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const paid = invoice.payment?.status === "confirmed";
                  return (
                    <tr key={invoice.id}>
                      <td data-label="Número">{invoice.number}</td>
                      <td data-label="Plan">{invoice.order.planName}</td>
                      <td data-label="Importe" className="account-price">{formatMinorAmount(invoice.totalCents, invoice.currency)}</td>
                      <td data-label="Estado">{invoiceStatusLabel(invoice.status, paid)}</td>
                      <td data-label="Impuesto">{taxModeLabel(invoice.taxMode)}</td>
                      <td data-label="Pago">{paymentStatusLabel(invoice.payment?.status)}</td>
                      <td data-label="Fecha"><time dateTime={invoice.createdAt.toISOString()}>{formatDateTime(invoice.createdAt)}</time></td>
                      <td data-label="Acción">
                        {invoice.taxMode === "none" && !invoice.payment ? <AdminCommerceForms invoiceId={invoice.id} /> : null}
                        {invoice.taxMode !== "none" ? <p>Pago bloqueado: la factura sigue como proforma.</p> : null}
                        {invoice.payment ? <p>{paymentStatusLabel(invoice.payment.status)}. {WHM_ACTIVATION_NOTE}</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="glass admin-card" aria-labelledby="servicios-admin-titulo">
        <h2 id="servicios-admin-titulo">Servicios</h2>
        <p className="muted">{WHM_ACTIVATION_NOTE} No hay pasarela ni alta automática.</p>
        {services.length === 0 ? <p>No hay servicios. Sin un pago confirmado no se crea un alta pendiente.</p> : (
          <div className="table-wrap">
            <table className="commerce-table account-table">
              <caption>Estados manuales de este panel</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Nota</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td data-label="Plan">{service.planName}</td>
                    <td data-label="Estado">{serviceStatusLabel(service.status)}</td>
                    <td data-label="Nota">{service.note}</td>
                    <td data-label="Fecha"><time dateTime={service.createdAt.toISOString()}>{formatDateTime(service.createdAt)}</time></td>
                    <td data-label="Acción">{service.status === "pending_provision" ? <AdminCommerceForms serviceId={service.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="glass admin-card" aria-labelledby="tickets-admin-titulo">
        <h2 id="tickets-admin-titulo">Tickets</h2>
        {tickets.length === 0 ? <p>Todavía no hay tickets.</p> : (
          <ul className="account-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <p><strong>{ticket.subject}</strong> · {ticketStatusLabel(ticket.status)} · {ticket.user.email}</p>
                <p className="muted"><time dateTime={ticket.updatedAt.toISOString()}>{formatDateTime(ticket.updatedAt)}</time></p>
                <ul>
                  {ticket.messages.map((message) => (
                    <li key={message.id}>{authorLabel(message.author)}: {message.body}</li>
                  ))}
                </ul>
                <AdminCommerceForms ticketId={ticket.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
