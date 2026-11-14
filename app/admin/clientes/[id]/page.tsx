import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import {
  dateOnly,
  dateTime,
  invoiceStatus,
  money,
  serviceStatus,
  ticketStatus,
} from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";
import { VerifyEmailButton } from "@/components/admin/CommerceActions";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) notFound();
  const [invoices, services, tickets] = await Promise.all([
    db.customerInvoice.findMany({
      where: { userId: id },
      include: { order: true, payment: true },
      orderBy: { createdAt: "desc" },
    }),
    db.customerService.findMany({
      where: { userId: id },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    }),
    db.supportTicket.findMany({ where: { userId: id }, orderBy: { updatedAt: "desc" } }),
  ]);
  const paid = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.status !== "paid") continue;
    paid.set(invoice.currency, (paid.get(invoice.currency) ?? 0) + invoice.totalCents);
  }

  return (
    <>
      <p className="back-link">
        <Link href="/admin/clientes">← Clientes</Link>
      </p>
      <PageHeader eyebrow="CLIENTE" title={user.name || user.email}>
        <a className="btn secondary" href={`mailto:${user.email}`} rel="noopener">
          Escribirle
        </a>
      </PageHeader>
      <dl className="facts">
        <div>
          <dt>Correo</dt>
          <dd>
            {user.email}{" "}
            <StatusBadge
              info={
                user.emailVerified
                  ? { label: "Verificado", tone: "ok" }
                  : { label: "Sin verificar", tone: "warn" }
              }
            />{" "}
            {user.emailVerified ? null : <VerifyEmailButton userId={user.id} />}
          </dd>
        </div>
        <div>
          <dt>Cliente desde</dt>
          <dd>{dateOnly(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Total pagado</dt>
          <dd>
            {paid.size ? [...paid].map(([currency, cents]) => money(cents, currency)).join(" · ") : "—"}
          </dd>
        </div>
        <div>
          <dt>Servicios activos</dt>
          <dd>{services.filter((s) => s.status === "active").length}</dd>
        </div>
      </dl>

      <section className="panel">
        <h2>Facturas</h2>
        {invoices.length ? (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link
                        className="row-link"
                        href={`/admin/facturas?estado=all&q=${encodeURIComponent(invoice.number)}`}
                      >
                        {invoice.number}
                      </Link>
                    </td>
                    <td>
                      {invoice.order.planName}
                      {invoice.order.domain ? <span className="cell-sub">{invoice.order.domain}</span> : null}
                    </td>
                    <td>{money(invoice.totalCents, invoice.currency)}</td>
                    <td>
                      <StatusBadge info={invoiceStatus(invoice.status)} />
                    </td>
                    <td>{dateOnly(invoice.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Sin facturas." />
        )}
      </section>

      <section className="panel">
        <h2>Servicios</h2>
        {services.length ? (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Dominio</th>
                  <th scope="col">cPanel</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>{service.planName}</td>
                    <td>{service.order.domain || "—"}</td>
                    <td>{service.cpanelUser || "—"}</td>
                    <td>
                      <StatusBadge info={serviceStatus(service.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Sin servicios." />
        )}
      </section>

      <section className="panel">
        <h2>Tickets</h2>
        {tickets.length ? (
          <ul className="plain-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link className="row-link" href={`/admin/tickets/${ticket.id}`}>
                  {ticket.subject}
                </Link>
                <StatusBadge info={ticketStatus(ticket.status)} />
                <span className="muted">{dateTime(ticket.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin tickets." />
        )}
      </section>
    </>
  );
}
