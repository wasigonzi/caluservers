import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminCommerceForms } from "@/components/admin/AdminCommerceForms";
import { billingPolicy } from "@/lib/commerce";
import { paypalReady, paypalWebhookReady, paypalEnv } from "@/lib/paypal";
import { provisionConfiguration } from "@/lib/whm-provision";

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

export default async function CommerceAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [customers, invoices, services, tickets] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.customerInvoice.findMany({
      include: { payment: true, order: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.customerService.findMany({
      include: { order: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.supportTicket.findMany({
      include: { messages: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);
  const policy = billingPolicy();
  const provision = await provisionConfiguration().catch(() => null);

  return (
    <>
      <h1>Clientes propios</h1>
      <ul className="muted">
        <li>
          Moneda e impuesto: {policy.ok ? `${policy.currency}, sin impuesto` : policy.error}
        </li>
        <li>
          Cobro con PayPal:{" "}
          {paypalReady()
            ? `activo (${paypalEnv()})${paypalWebhookReady() ? " con webhook verificado" : " SIN PAYPAL_WEBHOOK_ID: el aviso de PayPal se rechaza"}`
            : "no configurado; solo cobro manual"}
        </li>
        <li>
          Alta automática en WHM:{" "}
          {provision
            ? provision.ready
              ? "lista"
              : provision.enabled
                ? "activada pero incompleta"
                : "desactivada"
            : "no se pudo leer"}{" "}
          · <Link href="/admin/provision">configurar</Link>
        </li>
      </ul>

      <h2>Clientes</h2>
      <ul>
        {customers.map((user) => (
          <li key={user.id}>
            {user.email} · verificado {user.emailVerified ? "sí" : "no"}
          </li>
        ))}
      </ul>

      <h2>Facturas</h2>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            {invoice.number} · {money(invoice.totalCents, invoice.currency)} · {invoice.status} ·
            impuesto {invoice.taxMode}
            {invoice.payment
              ? ` · pago ${invoice.payment.status} vía ${invoice.payment.provider}`
              : " · sin pago"}
            {invoice.order.domain ? ` · ${invoice.order.domain}` : ""}
            {invoice.taxMode === "none" && !invoice.payment ? (
              <AdminCommerceForms invoiceId={invoice.id} />
            ) : null}
          </li>
        ))}
      </ul>

      <h2>Servicios</h2>
      <ul>
        {services.map((service) => (
          <li key={service.id}>
            {service.planName}: {SERVICE_LABELS[service.status] ?? service.status}
            {service.order.domain ? ` · ${service.order.domain}` : ""}
            {service.cpanelUser ? ` · cPanel ${service.cpanelUser}` : ""}
            {service.provisionAttempts ? ` · intentos ${service.provisionAttempts}` : ""}
            {service.note ? `. ${service.note}` : ""}
            {service.provisionError ? (
              <p className="error">{service.provisionError}</p>
            ) : null}
            {service.status === "pending_provision" ? (
              <AdminCommerceForms
                serviceId={service.id}
                canProvision={Boolean(provision?.ready && service.order.domain)}
              />
            ) : null}
          </li>
        ))}
      </ul>

      <h2>Tickets</h2>
      <ul>
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            {ticket.subject} · {ticket.status}
            <ul>
              {ticket.messages.map((message) => (
                <li key={message.id}>
                  {message.author}: {message.body}
                </li>
              ))}
            </ul>
            <AdminCommerceForms ticketId={ticket.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
