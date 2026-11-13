import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import {
  activityLog,
  activityTotal,
  actorNames,
  type ActivityEntry,
} from "@/lib/admin-data";
import { actionLabel, dateTime, pageNumber } from "@/lib/admin-format";
import { EmptyState, LoadError, PageHeader, Pagination, withQuery } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const SIZE = 40;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const params = await searchParams;
  let failed = false;
  let total = 0;
  let page = 1;
  let pages = 1;
  let entries: ActivityEntry[] = [];
  let names = new Map<string, string>();
  try {
    total = await activityTotal();
    pages = Math.max(1, Math.ceil(total / SIZE));
    page = pageNumber(params.p, pages);
    entries = await activityLog(SIZE, (page - 1) * SIZE);
    names = await actorNames(entries);
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        eyebrow="AUDITORÍA"
        title="Actividad"
        description="Diario de lo que ocurre en la tienda y en el panel: pedidos, cobros, altas y cambios de configuración. No se puede editar."
      />
      {failed ? <LoadError what="el diario" /> : null}
      {!failed && !entries.length ? <EmptyState title="Todavía no hay actividad registrada." /> : null}
      {entries.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Qué</th>
                <th scope="col">Quién</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.source}-${entry.id}`}>
                  <td className="nowrap">{dateTime(entry.createdAt)}</td>
                  <td>
                    {actionLabel(entry.action)}
                    <span className="cell-sub">{entry.source === "panel" ? "Panel" : "Tienda"}</span>
                  </td>
                  <td>{names.get(entry.actor) ?? entry.actor}</td>
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
        hrefFor={(p) => withQuery("/admin/actividad", { p })}
      />
    </>
  );
}
