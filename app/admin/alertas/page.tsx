import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { MarkAllReadButton, MarkReadButton } from "@/components/admin/AlertActions";
import { db } from "@/lib/db";
import { loadFailure, type LoadFailure } from "@/lib/admin-data";
import { dateTime, pageNumber } from "@/lib/admin-format";
import {
  EmptyState,
  FilterTabs,
  LoadError,
  PageHeader,
  Pagination,
  withQuery,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Aviso",
  critical: "Crítica",
};

type Search = {
  read?: string;
  severity?: string;
  p?: string;
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("audit:view")) {
    return <AccessDenied permission="audit:view" />;
  }
  const params = await searchParams;
  const read = params.read === "read" || params.read === "unread" ? params.read : "all";
  const severity = ["info", "warning", "critical"].includes(params.severity ?? "")
    ? params.severity!
    : "";
  const where: { readAt?: { not: null } | null; severity?: string } = {};
  if (read === "read") where.readAt = { not: null };
  if (read === "unread") where.readAt = null;
  if (severity) where.severity = severity;
  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let unread = 0;
  let alerts: {
    id: string;
    ruleKey: string;
    severity: string;
    title: string;
    body: string;
    resourceType: string | null;
    resourceId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }[] = [];
  try {
    [total, unread] = await Promise.all([
      db.alert.count({ where }),
      db.alert.count({ where: { readAt: null } }),
    ]);
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    alerts = await db.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch (error) {
    failed = loadFailure(error, "alertas");
  }
  const query = {
    read: read === "all" ? undefined : read,
    severity: severity || undefined,
  };
  const tab = (label: string, key: string) => ({
    label,
    active: read === key,
    href: withQuery("/admin/alertas", { ...query, read: key === "all" ? undefined : key }),
  });

  return (
    <>
      <PageHeader
        eyebrow="ALERTAS"
        title="Alertas"
        description="Avisos del sistema: inicios de sesión sospechosos, cambios de contraseña, fallos de aprovisionamiento, consumo anormal y acciones administrativas críticas. Sin SMTP configurado, las alertas solo viven aquí: no sale ningún correo."
      >
        <MarkAllReadButton />
      </PageHeader>
      {unread > 0 ? (
        <p className="notice" role="status">
          {unread === 1 ? "Hay 1 alerta sin leer." : `Hay ${unread} alertas sin leer.`}
        </p>
      ) : null}
      <div className="toolbar">
        <FilterTabs
          label="Filtrar alertas por lectura"
          items={[
            tab("Todas", "all"),
            tab("Sin leer", "unread"),
            tab("Leídas", "read"),
          ]}
        />
        <FilterTabs
          label="Filtrar alertas por severidad"
          items={[
            {
              label: "Todas las severidades",
              active: !severity,
              href: withQuery("/admin/alertas", { ...query, severity: undefined }),
            },
            ...Object.entries(SEVERITY_LABELS).map(([key, label]) => ({
              label,
              active: severity === key,
              href: withQuery("/admin/alertas", { ...query, severity: key }),
            })),
          ]}
        />
      </div>
      {failed ? <LoadError what="las alertas" reason={failed} /> : null}
      {!failed && !alerts.length ? <EmptyState title="No hay alertas con estos filtros." /> : null}
      {alerts.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Severidad</th>
                <th scope="col">Alerta</th>
                <th scope="col">Recurso</th>
                <th scope="col">Estado</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td className="nowrap">{dateTime(alert.createdAt)}</td>
                  <td>{SEVERITY_LABELS[alert.severity] ?? alert.severity}</td>
                  <td>
                    {alert.title}
                    <span className="cell-sub">{alert.body}</span>
                    <span className="cell-sub">{alert.ruleKey}</span>
                  </td>
                  <td>
                    {alert.resourceType ?? "—"}
                    <span className="cell-sub">{alert.resourceId ?? ""}</span>
                  </td>
                  <td>{alert.readAt ? "Leída" : "Sin leer"}</td>
                  <td>{alert.readAt ? null : <MarkReadButton id={alert.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pagination
        page={page}
        pages={pages}
        total={total}
        hrefFor={(p) => withQuery("/admin/alertas", { ...query, p })}
      />
    </>
  );
}
