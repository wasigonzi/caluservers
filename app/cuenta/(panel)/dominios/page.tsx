import Link from "next/link";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";
import type { StatusInfo } from "@/lib/admin-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis dominios" };

const STATUS: Record<string, StatusInfo> = {
  active: { label: "Activo", tone: "ok" },
  pending: { label: "Pendiente", tone: "warn" },
  pending_transfer: { label: "Transferencia pendiente", tone: "warn" },
  expired: { label: "Vencido", tone: "danger" },
  redemption: { label: "En redención", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "danger" },
};

function domainStatus(status: string): StatusInfo {
  return STATUS[status] ?? { label: status, tone: "muted" };
}

function daysLeft(expiresAt: Date | null): string | null {
  if (!expiresAt) return null;
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `vencido hace ${-days} día(s)`;
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}

export default async function AccountDomains({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; msg?: string; error?: string }>;
}) {
  const user = await requireCustomer();
  const params = await searchParams;
  const prefill = typeof params.domain === "string" ? params.domain : "";
  const domains = await db.registeredDomain.findMany({
    where: { userId: user.id },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title="Mis dominios"
        description="Registra, renueva y transfiere tus dominios. La renovación es por un año y el precio queda congelado en el pedido."
      >
        <Link className="btn" href="/domains">
          Buscar un dominio
        </Link>
      </PageHeader>
      {params.msg ? (
        <p className="notice" role="status">
          {params.msg}
        </p>
      ) : null}
      {params.error ? (
        <p className="error" role="alert">
          {params.error}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="register-title">
        <h2 id="register-title">Registrar o transferir un dominio</h2>
        <form method="post" action="/api/account/domains">
          <label className="field">
            Dominio
            <input
              name="domain"
              defaultValue={prefill}
              placeholder="midominio.com"
              maxLength={253}
              required
            />
          </label>
          <label className="field">
            Qué quieres hacer
            <select name="kind" defaultValue="register">
              <option value="register">Registrarlo (1 año)</option>
              <option value="transfer">Transferirlo desde otro registrador</option>
              <option value="renewal">Renovarlo (si ya es tuyo aquí)</option>
            </select>
          </label>
          <label className="field">
            Código de autorización (solo para transferir)
            <input name="authCode" maxLength={128} autoComplete="off" placeholder="Código EPP del registrador actual" />
          </label>
          <p className="muted">
            Al pedirlo se crea el pedido y su factura: el registro se ejecuta
            en el registrador cuando se confirma el pago. Si la extensión no
            tiene precio publicado, el pedido no se crea.
          </p>
          <button className="btn" type="submit">
            Crear pedido
          </button>
        </form>
      </section>

      {!domains.length ? (
        <EmptyState title="Todavía no tienes dominios.">
          Un dominio aparece aquí cuando se confirma el pago de su pedido.{" "}
          <Link className="row-link" href="/domains">
            Buscar un dominio
          </Link>
        </EmptyState>
      ) : null}
      <div className="service-grid">
        {domains.map((domain) => {
          const left = daysLeft(domain.expiresAt);
          const nameservers = Array.isArray(domain.nameservers)
            ? domain.nameservers.filter((ns): ns is string => typeof ns === "string")
            : [];
          return (
            <article key={domain.id} className="panel service-tile">
              <div className="service-tile-head">
                <div>
                  <h2>{domain.domain}</h2>
                  <p className="muted">
                    {domain.registrarKey ?? "porkbun"}
                    {left ? ` · ${left}` : ""}
                  </p>
                </div>
                <StatusBadge info={domainStatus(domain.status)} />
              </div>
              <dl className="service-facts">
                {domain.expiresAt ? (
                  <div>
                    <dt>Vence</dt>
                    <dd>{dateOnly(domain.expiresAt)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Renovación automática</dt>
                  <dd>{domain.autoRenew ? "Activada" : "Desactivada"}</dd>
                </div>
                {nameservers.length ? (
                  <div>
                    <dt>Servidores de nombres</dt>
                    <dd>
                      <code>{nameservers.join(", ")}</code>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {domain.failureReason ? <p className="error service-note">{domain.failureReason}</p> : null}
              <div className="row-actions">
                <form method="post" action={`/api/account/domains/${domain.id}`}>
                  <input type="hidden" name="action" value="autorenew" />
                  <input type="hidden" name="autoRenew" value={domain.autoRenew ? "false" : "true"} />
                  <button className="btn secondary small" type="submit">
                    {domain.autoRenew ? "Desactivar renovación automática" : "Activar renovación automática"}
                  </button>
                </form>
                <form method="post" action={`/api/account/domains/${domain.id}`}>
                  <input type="hidden" name="action" value="renew" />
                  <button className="btn small" type="submit">
                    Renovar 1 año
                  </button>
                </form>
                <form method="post" action={`/api/account/domains/${domain.id}`}>
                  <input type="hidden" name="action" value="refresh" />
                  <button className="btn secondary small" type="submit">
                    Actualizar estado
                  </button>
                </form>
                <form method="post" action={`/api/account/domains/${domain.id}`}>
                  <input type="hidden" name="action" value="authcode" />
                  <button className="btn secondary small" type="submit">
                    Pedir código EPP
                  </button>
                </form>
              </div>
              <form method="post" action={`/api/account/domains/${domain.id}`} className="stack">
                <input type="hidden" name="action" value="nameservers" />
                <label className="field">
                  Servidores de nombres (separados por comas)
                  <input
                    name="nameservers"
                    defaultValue={nameservers.join(", ")}
                    maxLength={500}
                  />
                </label>
                <button className="btn secondary small" type="submit">
                  Guardar servidores de nombres
                </button>
              </form>
              <form method="post" action={`/api/account/domains/${domain.id}`} className="stack">
                <input type="hidden" name="action" value="transfer" />
                <label className="field">
                  Código de autorización para transferirlo fuera
                  <input name="authCode" maxLength={128} autoComplete="off" placeholder="Código EPP" />
                </label>
                <button className="btn secondary small" type="submit">
                  Transferir este dominio
                </button>
              </form>
              <p className="muted service-hint">
                El código EPP se obtiene en el panel de Porkbun: CaluServers no
                lo guarda ni lo muestra aquí.
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
