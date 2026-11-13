import Link from "next/link";
import { redirect } from "next/navigation";
import { PayInvoiceButton, SignOutButton } from "@/components/account/AccountForms";
import { billingPolicy } from "@/lib/commerce";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";
import { paypalReady } from "@/lib/paypal";

export const dynamic = "force-dynamic";

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

const SERVICE_LABELS: Record<string, string> = {
  pending_provision: "pendiente de alta",
  provisioning: "alta en curso",
  active: "activo",
  cancelled: "cancelado",
};

export default async function AccountHome({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;
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
  const canPay = paypalReady() && billingPolicy().ok;

  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Tu cuenta</h1>
      <p className="muted">{session.user.email}</p>
      {pago === "cancelado" ? (
        <p className="notice" role="status">
          Cancelaste el pago en PayPal. La factura sigue pendiente y puedes pagarla cuando quieras.
        </p>
      ) : null}
      <SignOutButton />

      <h2>Pedidos</h2>
      {orders.length ? (
        <ul>
          {orders.map((order) => (
            <li key={order.id}>
              {order.planName}: {money(order.totalCents, order.currency)} · {order.status}
              {order.domain ? ` · ${order.domain}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Todavía no tienes pedidos.</p>
      )}

      <h2>Facturas</h2>
      {invoices.length ? (
        <ul>
          {invoices.map((invoice) => {
            const paid = invoice.payment?.status === "confirmed";
            const payable = !paid && invoice.status !== "void" && invoice.taxMode === "none";
            return (
              <li key={invoice.id}>
                {invoice.number}: {money(invoice.totalCents, invoice.currency)} ·{" "}
                {paid ? `pagada (${invoice.payment?.provider})` : invoice.status}
                {invoice.taxMode !== "none" ? " · proforma no cobrable" : ""}
                {payable && canPay ? (
                  <>
                    {" "}
                    <PayInvoiceButton invoiceId={invoice.id} />
                  </>
                ) : null}
                {payable && !canPay ? (
                  <span className="muted">
                    {" "}
                    · el cobro en línea no está activo; un administrador confirmará el pago
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Todavía no tienes facturas.</p>
      )}

      <h2>Servicios</h2>
      {services.length ? (
        <ul>
          {services.map((service) => (
            <li key={service.id}>
              {service.planName}: {SERVICE_LABELS[service.status] ?? service.status}
              {service.cpanelUser ? ` · usuario cPanel ${service.cpanelUser}` : ""}
              {service.note ? `. ${service.note}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Todavía no tienes servicios activos.</p>
      )}

      <h2>Tickets</h2>
      {tickets.length ? (
        <ul>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              {ticket.subject}: {ticket.status}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No tienes tickets abiertos.</p>
      )}

      <p>
        <Link href="/cuenta/tickets">Abrir un ticket</Link> ·{" "}
        <Link href="/web-hosting">Ver planes</Link>
      </p>
    </main>
  );
}
