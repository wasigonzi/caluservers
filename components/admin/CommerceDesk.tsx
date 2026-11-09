import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCommerceForms } from "@/components/admin/AdminCommerceForms";
import { billingPolicy } from "@/lib/commerce";
import { loadOrExplain } from "@/lib/storage-status";
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

export type CommerceFocus = "all" | "clientes" | "pagos";

export async function CommerceDesk({ focus }: { focus: CommerceFocus }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const policy = billingPolicy();
  const [customers, invoices, services, tickets] = await Promise.all([
    loadOrExplain(() => db.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 })),
    loadOrExplain(() => db.customerInvoice.findMany({ include: { payment: true, order: true }, orderBy: { createdAt: "desc" }, take: 50 })),
    loadOrExplain(() => db.customerService.findMany({ orderBy: { createdAt: "desc" }, take: 50 })),
    focus === "all"
      ? loadOrExplain(() => db.supportTicket.findMany({ include: { messages: { orderBy: { createdAt: "asc" } }, user: true }, orderBy: { updatedAt: "desc" }, take: 50 }))
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  const title = focus === "clientes" ? "Clientes" : focus === "pagos" ? "Pagos" : "Comercio";
  return (
    <>
      <header className="dashboard-heading">
        <div>
          <p className="studio-eyebrow">COMERCIO</p>
          <h1>{title}</h1>
          <p className="muted">Clientes, proformas y pagos de este sitio. Los importes se leen en dólares. Un pago confirmado no activa el servicio ni llama a WHM.</p>
        </div>
      </header>
      <nav className="admin-tabs" aria-label="Comercio">
        <Link className={focus === "clientes" ? "admin-tab active" : "admin-tab"} href="/admin/clientes" aria-current={focus === "clientes" ? "page" : undefined}>Clientes</Link>
        <Link className={focus === "pagos" ? "admin-tab active" : "admin-tab"} href="/admin/pagos" aria-current={focus === "pagos" ? "page" : undefined}>Pagos</Link>
        <Link className={focus === "all" ? "admin-tab active" : "admin-tab"} href="/admin/comercio" aria-current={focus === "all" ? "page" : undefined}>Todo</Link>
      </nav>
      <div className="fiscal-callout">
        <p>{ISSUER_CONTEXT}</p>
        <p>{policy.ok ? EXPLICIT_TAX_ENVIRONMENT_NOTE : MISSING_TAX_POLICY_ERROR}</p>
      </div>
      {focus !== "pagos" ? (
        <section className="glass admin-card" aria-labelledby="clientes-titulo">
          <h2 id="clientes-titulo">Clientes</h2>
          {!customers.ok ? <p className="error" role="alert">{customers.message}</p> : customers.data.length === 0 ? <p>Todavía no hay clientes en este sitio.</p> : (
            <div className="table-wrap">
              <table className="commerce-table account-table">
                <caption>Cuentas registradas y sus servicios, facturas y pagos</caption>
                <thead>
                  <tr>
                    <th scope="col">Correo</th>
                    <th scope="col">Verificación</th>
                    <th scope="col">Servicios y pagos</th>
                    <th scope="col">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.data.map((user) => {
                    const ownServices = services.ok ? services.data.filter((service) => service.userId === user.id) : [];
                    const ownInvoices = invoices.ok ? invoices.data.filter((invoice) => invoice.userId === user.id) : [];
                    return (
                      <tr key={user.id}>
                        <td data-label="Correo">{user.email}</td>
                        <td data-label="Verificación">{user.emailVerified ? "Correo verificado" : "Correo sin verificar"}</td>
                        <td data-label="Servicios y pagos">
                          {ownServices.length === 0 && ownInvoices.length === 0 ? "Sin servicios ni pagos leídos." : null}
                          {ownServices.map((service) => (
                            <p key={service.id}>{service.planName}: {serviceStatusLabel(service.status)}</p>
                          ))}
                          {ownInvoices.map((invoice) => (
                            <p key={invoice.id}>{invoice.number}: {formatMinorAmount(invoice.totalCents, invoice.currency)} · {paymentStatusLabel(invoice.payment?.status)}</p>
                          ))}
                        </td>
                        <td data-label="Alta"><time dateTime={user.createdAt.toISOString()}>{formatDateTime(user.createdAt)}</time></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!services.ok ? <p className="error" role="alert">{services.message}</p> : null}
        </section>
      ) : null}
      {focus !== "clientes" ? (
        <section className="glass admin-card" aria-labelledby="pagos-titulo">
          <h2 id="pagos-titulo">Pagos</h2>
          <p className="muted">Una proforma no se cobra. Confirmar un pago manual no crea una cuenta en WHM.</p>
          {!invoices.ok ? <p className="error" role="alert">{invoices.message}</p> : invoices.data.length === 0 ? <p>Todavía no hay facturas ni pagos.</p> : (
            <div className="table-wrap">
              <table className="commerce-table account-table">
                <caption>Proformas y pagos manuales. El importe sale de la factura, no de un valor escrito aquí.</caption>
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
                  {invoices.data.map((invoice) => {
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
      ) : null}
      {focus === "all" ? (
        <section className="glass admin-card" aria-labelledby="servicios-admin-titulo">
          <h2 id="servicios-admin-titulo">Servicios</h2>
          <p className="muted">{WHM_ACTIVATION_NOTE}</p>
          {!services.ok ? <p className="error" role="alert">{services.message}</p> : services.data.length === 0 ? <p>No hay servicios. Sin un pago confirmado no se crea un alta pendiente.</p> : (
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
                  {services.data.map((service) => (
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
      ) : null}
      {focus === "all" && tickets.ok ? (
        <section className="glass admin-card" aria-labelledby="tickets-admin-titulo">
          <h2 id="tickets-admin-titulo">Tickets</h2>
          {tickets.data.length === 0 ? <p>Todavía no hay tickets.</p> : (
            <ul className="account-list">
              {tickets.data.map((ticket) => (
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
      ) : null}
      {focus === "all" && !tickets.ok ? <p className="error" role="alert">{tickets.message}</p> : null}
    </>
  );
}
