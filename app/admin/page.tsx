import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FileText,
  Inbox,
  LifeBuoy,
  Palette,
  Receipt,
  ServerCog,
} from "lucide-react";
import { isAdmin } from "@/lib/auth";
import {
  activityLog,
  actorNames,
  dashboardData,
  loadFailure,
  navCounts,
  systemChecks,
  type ActivityEntry,
  type DashboardData,
  type LoadFailure,
} from "@/lib/admin-data";
import { actionLabel, dateTime, money } from "@/lib/admin-format";
import { whmConfiguration } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import WhmReadPanel from "@/components/admin/WhmReadPanel";
import { LoadError } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

function trend(current: number, previous: number): string {
  if (!previous) return current ? "Sin cobros el mes pasado" : "Sin cobros todavía";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% frente al mes pasado`;
}

export default async function Admin() {
  if (!(await isAdmin())) redirect("/admin/login");
  let configured = false,
    storageError = "";
  try {
    configured = (await whmConfiguration()).configured;
  } catch (error) {
    storageError = safeWhmError(error).message;
  }
  let failed: LoadFailure | null = null;
  let data: DashboardData | null = null;
  let recent: ActivityEntry[] = [];
  let names = new Map<string, string>();
  try {
    [data, recent] = await Promise.all([dashboardData(), activityLog(8)]);
    names = await actorNames(recent);
  } catch (error) {
    failed = loadFailure(error, "resumen");
    data = null;
  }
  const [counts, checks] = await Promise.all([navCounts(), systemChecks()]);
  const peak = data ? Math.max(1, ...data.months.map((m) => m.cents)) : 1;
  const attention = counts
    ? [
        {
          href: "/admin/facturas?estado=issued",
          icon: Receipt,
          count: counts.facturas,
          label: counts.facturas === 1 ? "factura por cobrar" : "facturas por cobrar",
        },
        {
          href: "/admin/servicios?estado=pending_provision",
          icon: ServerCog,
          count: counts.servicios,
          label: counts.servicios === 1 ? "servicio pendiente de alta" : "servicios pendientes de alta",
        },
        {
          href: "/admin/tickets?estado=open",
          icon: LifeBuoy,
          count: counts.tickets,
          label: counts.tickets === 1 ? "ticket sin responder" : "tickets sin responder",
        },
        {
          href: "/admin/mensajes",
          icon: Inbox,
          count: counts.mensajes,
          label: counts.mensajes === 1 ? "mensaje nuevo" : "mensajes nuevos",
        },
      ]
    : [];
  const pending = attention.filter((item) => item.count > 0);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="studio-eyebrow">CENTRO DE CONTROL</p>
          <h1>Resumen del negocio</h1>
          <p className="muted page-head-sub">
            Cobros, servicios y soporte de tu área de clientes, con lo que pide tu atención
            primero.
          </p>
        </div>
        <div className="page-head-actions">
          <Link className="btn secondary" href="/" target="_blank" rel="noreferrer">
            Ver sitio <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {failed ? <LoadError what="el resumen" reason={failed} /> : null}

      {data ? (
        <section className="kpi-grid" aria-label="Indicadores">
          <div className="kpi">
            <p className="kpi-label">Cobrado este mes</p>
            <p className="kpi-value">{money(data.revenueMonthCents, data.currency)}</p>
            <p className="kpi-foot">{trend(data.revenueMonthCents, data.revenuePrevCents)}</p>
          </div>
          <Link className="kpi kpi-link" href="/admin/facturas?estado=issued">
            <p className="kpi-label">Por cobrar</p>
            <p className="kpi-value">{money(data.outstandingCents, data.currency)}</p>
            <p className="kpi-foot">
              {data.outstandingCount} {data.outstandingCount === 1 ? "factura emitida" : "facturas emitidas"}
            </p>
          </Link>
          <Link className="kpi kpi-link" href="/admin/servicios?estado=active">
            <p className="kpi-label">Servicios activos</p>
            <p className="kpi-value">{data.activeServices}</p>
            <p className="kpi-foot">
              {counts ? `${counts.servicios} pendientes de alta` : " "}
            </p>
          </Link>
          <Link className="kpi kpi-link" href="/admin/clientes">
            <p className="kpi-label">Clientes</p>
            <p className="kpi-value">{data.customers}</p>
            <p className="kpi-foot">{data.customersMonth} nuevos este mes</p>
          </Link>
        </section>
      ) : null}

      <div className="dash-columns">
        <section className="panel" aria-labelledby="dash-attention">
          <h2 id="dash-attention">Requiere tu atención</h2>
          {!counts ? (
            <p className="muted">No se pudieron leer los pendientes.</p>
          ) : pending.length ? (
            <ul className="attention-list">
              {pending.map(({ href, icon: Icon, count, label }) => (
                <li key={href}>
                  <Link href={href}>
                    <Icon size={18} aria-hidden="true" />
                    <strong>{count}</strong>
                    <span>{label}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted all-clear">
              <CircleCheck size={18} aria-hidden="true" /> Todo al día: no hay cobros, altas,
              tickets ni mensajes pendientes.
            </p>
          )}
        </section>

        {data ? (
          <section className="panel" aria-labelledby="dash-revenue">
            <h2 id="dash-revenue">Cobros de los últimos 6 meses</h2>
            <ol className="bar-chart">
              {data.months.map((month, index) => (
                <li key={index}>
                  <span className="bar-value">
                    {month.cents ? money(month.cents, data.currency) : "—"}
                  </span>
                  <span
                    className="bar"
                    style={{ height: `${Math.max(2, (month.cents / peak) * 100)}%` }}
                    aria-hidden="true"
                  />
                  <span className="bar-label">{month.label}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <div className="dash-columns">
        <section className="panel" aria-labelledby="dash-activity">
          <div className="panel-head">
            <h2 id="dash-activity">Actividad reciente</h2>
            <Link className="panel-link" href="/admin/actividad">
              Ver todo →
            </Link>
          </div>
          {recent.length ? (
            <ul className="activity-list">
              {recent.map((entry) => (
                <li key={`${entry.source}-${entry.id}`}>
                  <span className="activity-what">{actionLabel(entry.action)}</span>
                  <span className="muted">
                    {names.get(entry.actor) ?? entry.actor} · {dateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Todavía no hay actividad registrada.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="dash-system">
          <h2 id="dash-system">Estado de la configuración</h2>
          <ul className="check-list">
            {checks.map((check) => {
              const Icon =
                check.state === "ok" ? CircleCheck : check.state === "warn" ? CircleAlert : CircleDashed;
              return (
                <li key={check.label} className={`check-${check.state}`}>
                  <Icon size={18} aria-hidden="true" />
                  <div>
                    <p className="check-label">
                      {check.href ? <Link href={check.href}>{check.label}</Link> : check.label}
                    </p>
                    <p className="muted">{check.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="dashboard-workspaces dash-shortcuts" aria-label="Accesos de gestión">
        <Link className="workspace-card workspace-primary" href="/admin/site">
          <Palette size={26} aria-hidden="true" />
          <span className="studio-eyebrow">ESTUDIO DE MARCA</span>
          <h2>Marca, catálogo y apariencia</h2>
          <p>Logos, paleta, planes y precios. Previsualiza los cambios antes de publicarlos.</p>
          <span className="workspace-link">
            Abrir estudio <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </Link>
        <Link className="workspace-card" href="/admin/pages">
          <FileText size={26} aria-hidden="true" />
          <span className="studio-eyebrow">CONTENIDO</span>
          <h2>Textos de cada página</h2>
          <p>Edita los textos de tu web y mantén el contenido alineado con tu marca.</p>
          <span className="workspace-link">
            Editar páginas <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </Link>
      </section>

      <WhmReadPanel configured={configured} storageError={storageError} />
    </>
  );
}
