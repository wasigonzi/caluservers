import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import {
  AUDIT_LOG_PAGE_SIZE,
  buildAuditLogWhere,
  type AuditActorType,
} from "@/lib/audit-log";
import { db } from "@/lib/db";
import { loadFailure, type LoadFailure } from "@/lib/admin-data";
import { actionLabel, dateTime, pageNumber } from "@/lib/admin-format";
import {
  EmptyState,
  FilterTabs,
  LoadError,
  PageHeader,
  Pagination,
  withQuery,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const ACTOR_LABELS: Record<AuditActorType, string> = {
  admin: "Admin",
  client: "Cliente",
  system: "Sistema",
};

type Search = {
  actor?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  p?: string;
};

export default async function AuditLogPage({
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
  const actor = ["admin", "client", "system"].includes(params.actor ?? "")
    ? (params.actor as AuditActorType)
    : undefined;
  const action = (params.action ?? "").trim().slice(0, 80);
  const resource = (params.resource ?? "").trim().slice(0, 80);
  const from = params.from ?? "";
  const to = params.to ?? "";
  const where = buildAuditLogWhere({ actorType: actor, action, resource, from, to });
  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let entries: {
    id: string;
    actorType: string;
    actorId: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    details: string;
    createdAt: Date;
  }[] = [];
  try {
    total = await db.auditLog.count({ where });
    pages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
    page = pageNumber(params.p, pages);
    entries = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
    });
  } catch (error) {
    failed = loadFailure(error, "auditoria");
  }
  const query = { actor, action: action || undefined, resource: resource || undefined, from: from || undefined, to: to || undefined };
  const tab = (label: string, key: AuditActorType | undefined) => ({
    label,
    active: actor === key,
    href: withQuery("/admin/auditoria", { ...query, actor: key }),
  });

  return (
    <>
      <PageHeader
        eyebrow="AUDITORÍA"
        title="Auditoría unificada"
        description="Un solo diario con lo que ocurre en la tienda y en el panel: pedidos, cobros, altas, cambios de configuración y accesos. La IP se guarda solo como hash, nunca en claro. No se puede editar."
      />
      <div className="toolbar">
        <FilterTabs
          label="Filtrar por actor"
          items={[
            tab("Todos", undefined),
            tab("Admin", "admin"),
            tab("Cliente", "client"),
            tab("Sistema", "system"),
          ]}
        />
      </div>
      <form className="toolbar" action="/admin/auditoria" method="get" role="search">
        {actor ? <input type="hidden" name="actor" value={actor} /> : null}
        <label>
          Acción{" "}
          <input type="search" name="action" defaultValue={action} placeholder="p. ej. payment.confirmed" maxLength={80} />
        </label>
        <label>
          Recurso{" "}
          <input type="search" name="resource" defaultValue={resource} placeholder="tipo o id del recurso" maxLength={80} />
        </label>
        <label>
          Desde{" "}
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          Hasta{" "}
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn secondary small" type="submit">
          Filtrar
        </button>
      </form>
      {failed ? <LoadError what="la auditoría" reason={failed} /> : null}
      {!failed && !entries.length ? <EmptyState title="Ningún registro coincide con los filtros." /> : null}
      {entries.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Actor</th>
                <th scope="col">Qué</th>
                <th scope="col">Recurso</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="nowrap">{dateTime(entry.createdAt)}</td>
                  <td>
                    {ACTOR_LABELS[entry.actorType as AuditActorType] ?? entry.actorType}
                    <span className="cell-sub">{entry.actorId ?? "—"}</span>
                  </td>
                  <td>{actionLabel(entry.action)}</td>
                  <td>
                    {entry.resourceType ?? "—"}
                    <span className="cell-sub">{entry.resourceId ?? ""}</span>
                  </td>
                  <td className="cell-detail">{entry.details || "—"}</td>
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
        hrefFor={(p) => withQuery("/admin/auditoria", { ...query, p })}
      />
    </>
  );
}
