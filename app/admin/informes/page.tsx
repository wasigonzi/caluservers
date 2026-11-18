import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { loadFailure, type LoadFailure } from "@/lib/admin-data";
import { dateOnly, money } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { getReportsOverview, type ReportsOverview } from "@/lib/reports";
import { EmptyState, LoadError, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Informes (Fase 6). Permiso: reports:view; sin él, 403 en esta página y
 * en la exportación CSV (/api/admin/reports/export). Todo sale de la BD
 * real; sin datos, ceros honestos, nunca cifras inventadas.
 */
export default async function ReportsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("reports:view")) {
    return <AccessDenied permission="reports:view" />;
  }

  let failed: LoadFailure | null = null;
  let report: ReportsOverview | null = null;
  try {
    report = await getReportsOverview(db);
  } catch (error) {
    failed = loadFailure(error, "informes");
  }

  return (
    <>
      <PageHeader
        eyebrow="INFORMES"
        title="Informes"
        description="Antigüedad de facturas vencidas impagas, ingresos por mes y por producto, suscripciones por estado y dominios por expirar."
      >
        <Link className="btn secondary" href="/api/admin/reports/export?kind=aging">
          CSV de antigüedad
        </Link>
        <Link className="btn secondary" href="/api/admin/reports/export?kind=revenue">
          CSV de ingresos
        </Link>
      </PageHeader>
      {failed ? (
        <LoadError what="los informes" reason={failed} />
      ) : !report ? (
        <EmptyState title="Sin informes">No se pudo cargar el informe.</EmptyState>
      ) : (
        <>
          <h2>Antigüedad de facturas vencidas impagas</h2>
          <table>
            <thead>
              <tr>
                <th>Tramo</th>
                <th>Facturas</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {report.aging.buckets.map((bucket) => (
                <tr key={bucket.bucket}>
                  <td>{bucket.label}</td>
                  <td>{bucket.count}</td>
                  <td>{money(bucket.totalCents, "USD")}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{report.aging.totalCount}</strong>
                </td>
                <td>
                  <strong>{money(report.aging.totalCents, "USD")}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          {report.aging.invoices.length > 0 ? (
            <>
              <h3>Facturas vencidas</h3>
              <table>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Vencimiento</th>
                    <th>Días vencida</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {report.aging.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{dateOnly(invoice.dueDate)}</td>
                      <td>{invoice.daysOverdue}</td>
                      <td>{money(invoice.totalCents, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No hay facturas vencidas impagas.</p>
          )}

          <h2>Ingresos por mes (últimos 12 meses, facturas pagadas)</h2>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Facturas</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {report.revenue.months.map((month) => (
                <tr key={month.month}>
                  <td>{month.label}</td>
                  <td>{month.invoiceCount}</td>
                  <td>{money(month.totalCents, "USD")}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{report.revenue.months.reduce((sum, m) => sum + m.invoiceCount, 0)}</strong>
                </td>
                <td>
                  <strong>{money(report.revenue.totalCents, "USD")}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h2>Ingresos por producto (facturas pagadas)</h2>
          {report.revenue.products.length === 0 ? (
            <p className="muted">Todavía no hay ingresos por producto.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Líneas</th>
                  <th>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {report.revenue.products.map((product) => (
                  <tr key={product.product}>
                    <td>{product.product}</td>
                    <td>{product.lineCount}</td>
                    <td>{money(product.totalCents, "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Suscripciones por estado</h2>
          {report.subscriptions.byStatus.length === 0 ? (
            <p className="muted">No hay suscripciones.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Suscripciones</th>
                </tr>
              </thead>
              <tbody>
                {report.subscriptions.byStatus.map((row) => (
                  <tr key={row.status}>
                    <td>{row.status}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{report.subscriptions.total}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <h2>Dominios por expirar en 30 días</h2>
          {report.expiringDomains.length === 0 ? (
            <p className="muted">Ningún dominio activo expira en los próximos 30 días.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Dominio</th>
                  <th>Expira</th>
                  <th>Días restantes</th>
                </tr>
              </thead>
              <tbody>
                {report.expiringDomains.map((domain) => (
                  <tr key={domain.id}>
                    <td>{domain.domain}</td>
                    <td>{dateOnly(domain.expiresAt)}</td>
                    <td>{domain.daysLeft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
