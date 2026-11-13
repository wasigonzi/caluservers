import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cpanelLoginUrl, requireCustomer } from "@/lib/account-data";
import { dateOnly, serviceStatus } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis servicios" };

const EXPLAIN: Record<string, string> = {
  pending_provision: "Pago recibido. Estamos preparando tu servicio; te avisamos por correo cuando esté listo.",
  provisioning: "Estamos creando tu cuenta en el servidor ahora mismo.",
  cancelled: "Este servicio está cancelado.",
};

export default async function AccountServices() {
  const user = await requireCustomer();
  const [services, cpanel] = await Promise.all([
    db.customerService.findMany({
      where: { userId: user.id },
      include: { order: { include: { invoice: true } } },
      orderBy: { createdAt: "desc" },
    }),
    cpanelLoginUrl(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title="Mis servicios"
        description="Los planes que tienes contratados y cómo entrar a cada uno."
      >
        <Link className="btn" href="/web-hosting">
          Contratar otro
        </Link>
      </PageHeader>
      {!services.length ? (
        <EmptyState title="Todavía no tienes servicios.">
          Un servicio aparece aquí cuando se confirma el pago de su factura.{" "}
          <Link className="row-link" href="/web-hosting">
            Ver planes
          </Link>
        </EmptyState>
      ) : null}
      <div className="service-grid">
        {services.map((service) => {
          const active = service.status === "active";
          return (
            <article key={service.id} className="panel service-tile">
              <div className="service-tile-head">
                <div>
                  <h2>{service.planName}</h2>
                  <p className="muted">{service.order.domain || "Sin dominio asociado"}</p>
                </div>
                <StatusBadge info={serviceStatus(service.status)} />
              </div>
              <dl className="service-facts">
                <div>
                  <dt>Contratado</dt>
                  <dd>{dateOnly(service.createdAt)}</dd>
                </div>
                {service.provisionedAt ? (
                  <div>
                    <dt>Activo desde</dt>
                    <dd>{dateOnly(service.provisionedAt)}</dd>
                  </div>
                ) : null}
                {service.cpanelUser ? (
                  <div>
                    <dt>Usuario cPanel</dt>
                    <dd>
                      <code>{service.cpanelUser}</code>
                    </dd>
                  </div>
                ) : null}
                {service.order.invoice ? (
                  <div>
                    <dt>Factura</dt>
                    <dd>
                      <Link className="row-link" href={`/cuenta/facturas/${service.order.invoice.id}`}>
                        {service.order.invoice.number}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {EXPLAIN[service.status] ? <p className="muted service-note">{EXPLAIN[service.status]}</p> : null}
              <div className="row-actions">
                {active && service.cpanelUser && cpanel ? (
                  <a className="btn small" href={cpanel} target="_blank" rel="noopener noreferrer">
                    Abrir cPanel <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ) : null}
                <Link className="btn secondary small" href="/cuenta/tickets">
                  Pedir ayuda
                </Link>
              </div>
              {active && service.cpanelUser ? (
                <p className="muted service-hint">
                  La contraseña inicial se envió a tu correo al crear la cuenta. Si no la tienes,
                  pídenos una nueva por ticket.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
