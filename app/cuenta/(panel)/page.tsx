import Link from "next/link";
import { ArrowUpRight, CircleCheck, LifeBuoy, Receipt, ServerCog } from "lucide-react";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly, customerInvoiceStatus, money, serviceStatus } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumen" };

export default async function AccountHome({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;
  const user = await requireCustomer();
  const [invoices, services, tickets] = await Promise.all([
    db.customerInvoice.findMany({
      where: { userId: user.id },
      include: { payment: true, order: true },
      orderBy: { createdAt: "desc" },
    }),
    db.customerService.findMany({
      where: { userId: user.id },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    }),
    db.supportTicket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }),
  ]);
  const due = invoices.filter((invoice) => invoice.status === "issued");
  const dueTotals = new Map<string, number>();
  for (const invoice of due) {
    dueTotals.set(invoice.currency, (dueTotals.get(invoice.currency) ?? 0) + invoice.totalCents);
  }
  const active = services.filter((service) => service.status === "active");
  const pending = services.filter(
    (service) => service.status === "pending_provision" || service.status === "provisioning",
  );
  const answered = tickets.filter((ticket) => ticket.status === "answered");
  const openTickets = tickets.filter((ticket) => ticket.status !== "closed");
  const first = (user.name || "").trim().split(/\s+/)[0];

  return (
    <>
      <header className="page-head">
        <div>
          <p className="studio-eyebrow">ÁREA DE CLIENTE</p>
          <h1>{first ? `Hola, ${first}` : "Tu cuenta"}</h1>
          <p className="muted page-head-sub">
            Tus servicios, facturas y soporte en un solo lugar.
          </p>
        </div>
        <div className="page-head-actions">
          <Link className="btn" href="/web-hosting">
            Contratar un servicio
          </Link>
        </div>
      </header>

      {pago === "cancelado" ? (
        <p className="notice banner-warn" role="status">
          Cancelaste el pago en PayPal. La factura sigue pendiente y puedes pagarla cuando quieras.
        </p>
      ) : null}

      <section className="kpi-grid account-kpis" aria-label="Indicadores">
        <Link className="kpi kpi-link" href="/cuenta/servicios">
          <p className="kpi-label">Servicios activos</p>
          <p className="kpi-value">{active.length}</p>
          <p className="kpi-foot">
            {pending.length ? `${pending.length} en preparación` : `${services.length} en total`}
          </p>
        </Link>
        <Link className="kpi kpi-link" href="/cuenta/facturas">
          <p className="kpi-label">Por pagar</p>
          <p className="kpi-value">
            {dueTotals.size
              ? [...dueTotals].map(([currency, cents]) => money(cents, currency)).join(" · ")
              : "Nada"}
          </p>
          <p className="kpi-foot">
            {due.length} {due.length === 1 ? "factura pendiente" : "facturas pendientes"}
          </p>
        </Link>
        <Link className="kpi kpi-link" href="/cuenta/tickets">
          <p className="kpi-label">Soporte</p>
          <p className="kpi-value">{openTickets.length}</p>
          <p className="kpi-foot">
            {answered.length
              ? `${answered.length} con respuesta nueva`
              : openTickets.length === 1
                ? "ticket abierto"
                : "tickets abiertos"}
          </p>
        </Link>
      </section>

      <section className="panel" aria-labelledby="acc-next">
        <h2 id="acc-next">Qué hacer ahora</h2>
        {due.length || pending.length || answered.length ? (
          <ul className="attention-list">
            {due.map((invoice) => (
              <li key={invoice.id}>
                <Link href={`/cuenta/facturas/${invoice.id}`}>
                  <Receipt size={18} aria-hidden="true" />
                  <span>
                    Pagar la factura {invoice.number} de {invoice.order.planName} ·{" "}
                    {money(invoice.totalCents, invoice.currency)}
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
            {answered.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/cuenta/tickets/${ticket.id}`}>
                  <LifeBuoy size={18} aria-hidden="true" />
                  <span>Soporte respondió a «{ticket.subject}»</span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
            {pending.map((service) => (
              <li key={service.id}>
                <Link href="/cuenta/servicios">
                  <ServerCog size={18} aria-hidden="true" />
                  <span>
                    Estamos preparando {service.planName}
                    {service.order.domain ? ` para ${service.order.domain}` : ""}. Te avisamos por
                    correo.
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted all-clear">
            <CircleCheck size={18} aria-hidden="true" /> Todo al día: no tienes pagos ni respuestas
            pendientes.
          </p>
        )}
      </section>

      <div className="dash-columns">
        <section className="panel" aria-labelledby="acc-services">
          <div className="panel-head">
            <h2 id="acc-services">Mis servicios</h2>
            <Link className="panel-link" href="/cuenta/servicios">
              Ver todos →
            </Link>
          </div>
          {services.length ? (
            <ul className="plain-list">
              {services.slice(0, 4).map((service) => (
                <li key={service.id}>
                  <span>
                    <strong>{service.planName}</strong>
                    {service.order.domain ? (
                      <span className="cell-sub">{service.order.domain}</span>
                    ) : null}
                  </span>
                  <span className="muted">
                    <StatusBadge info={serviceStatus(service.status)} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Todavía no tienes servicios.">
              Un servicio aparece aquí cuando se confirma el pago de su factura.
            </EmptyState>
          )}
        </section>

        <section className="panel" aria-labelledby="acc-invoices">
          <div className="panel-head">
            <h2 id="acc-invoices">Últimas facturas</h2>
            <Link className="panel-link" href="/cuenta/facturas">
              Ver todas →
            </Link>
          </div>
          {invoices.length ? (
            <ul className="plain-list">
              {invoices.slice(0, 4).map((invoice) => (
                <li key={invoice.id}>
                  <span>
                    <Link className="row-link" href={`/cuenta/facturas/${invoice.id}`}>
                      {invoice.number}
                    </Link>
                    <span className="cell-sub">
                      {money(invoice.totalCents, invoice.currency)} · {dateOnly(invoice.createdAt)}
                    </span>
                  </span>
                  <span className="muted">
                    <StatusBadge info={customerInvoiceStatus(invoice.status)} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Todavía no tienes facturas.">
              Se crea una al contratar un plan.
            </EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
