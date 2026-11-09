import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountFrame } from "@/components/account/AccountFrame";
import { SignOutButton } from "@/components/account/AccountForms";
import { FiscalNotice } from "@/components/account/FiscalNotice";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";
import {
  formatDateTime,
  formatMinorAmount,
  invoiceStatusLabel,
  orderStatusLabel,
  paymentStatusLabel,
  serviceStatusLabel,
  taxModeLabel,
  ticketStatusLabel,
  WHM_ACTIVATION_NOTE,
} from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AccountHome() {
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");
  const [orders, invoices, services, tickets] = await Promise.all([
    db.customerOrder.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
    db.customerInvoice.findMany({
      where: { userId: session.user.id },
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    }),
    db.customerService.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } }),
    db.supportTicket.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <AccountFrame
      kicker="Cuenta CaluServers"
      title="Tu cuenta"
      lead="Pedidos, facturas y servicios de esta web. El portal anterior sigue aparte y desde aquí no se da de alta nada en WHM."
    >
      <p className="muted">{session.user.email}</p>
      <FiscalNotice />
      <SignOutButton />
      <section className="account-card glass" aria-labelledby="pedidos-titulo">
        <h2 id="pedidos-titulo">Pedidos</h2>
        {orders.length === 0 ? <p>Todavía no hay pedidos.</p> : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption>Pedidos de esta cuenta</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td data-label="Plan">{order.planName}</td>
                    <td data-label="Importe" className="account-price">{formatMinorAmount(order.totalCents, order.currency)}</td>
                    <td data-label="Estado">{orderStatusLabel(order.status)}</td>
                    <td data-label="Fecha"><time dateTime={order.createdAt.toISOString()}>{formatDateTime(order.createdAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="account-card glass" aria-labelledby="facturas-titulo">
        <h2 id="facturas-titulo">Facturas</h2>
        {invoices.length === 0 ? <p>Todavía no hay facturas.</p> : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption>Facturas de esta cuenta. Una proforma no se cobra.</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Impuesto</th>
                  <th scope="col">Pago</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Número">{invoice.number}</td>
                    <td data-label="Importe" className="account-price">{formatMinorAmount(invoice.totalCents, invoice.currency)}</td>
                    <td data-label="Estado">{invoiceStatusLabel(invoice.status, invoice.payment?.status === "confirmed")}</td>
                    <td data-label="Impuesto">{taxModeLabel(invoice.taxMode)}</td>
                    <td data-label="Pago">{paymentStatusLabel(invoice.payment?.status)}</td>
                    <td data-label="Fecha"><time dateTime={invoice.createdAt.toISOString()}>{formatDateTime(invoice.createdAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="account-card glass" aria-labelledby="servicios-titulo">
        <h2 id="servicios-titulo">Servicios</h2>
        <p className="account-note">{WHM_ACTIVATION_NOTE}</p>
        {services.length === 0 ? <p>No hay servicios. Sin pago confirmado no aparece un alta, ni siquiera pendiente.</p> : (
          <div className="account-table-wrap">
            <table className="account-table">
              <caption>Servicios anotados en este panel</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Nota</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td data-label="Plan">{service.planName}</td>
                    <td data-label="Estado">{serviceStatusLabel(service.status)}</td>
                    <td data-label="Nota">{service.note}</td>
                    <td data-label="Fecha"><time dateTime={service.createdAt.toISOString()}>{formatDateTime(service.createdAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="account-card glass" aria-labelledby="tickets-titulo">
        <h2 id="tickets-titulo">Tickets</h2>
        {tickets.length === 0 ? <p>Todavía no hay tickets.</p> : (
          <ul className="account-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                {ticket.subject}: {ticketStatusLabel(ticket.status)}. <time dateTime={ticket.updatedAt.toISOString()}>{formatDateTime(ticket.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
        <p><Link href="/cuenta/tickets">Abrir un ticket</Link> · <Link href="/web-hosting">Ver planes</Link></p>
      </section>
    </AccountFrame>
  );
}
