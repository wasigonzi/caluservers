import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { loadFailure, PAGE_SIZE, type LoadFailure } from "@/lib/admin-data";
import { dateOnly, pageNumber, searchTerm } from "@/lib/admin-format";
import { db } from "@/lib/db";
import {
  EmptyState,
  FilterTabs,
  LoadError,
  PageHeader,
  Pagination,
  SearchForm,
  StatusBadge,
  withQuery,
} from "@/components/admin/ui";
import type { StatusInfo } from "@/lib/admin-format";

export const dynamic = "force-dynamic";

const STATES = ["active", "pending", "pending_transfer", "expired", "redemption", "cancelled"] as const;
type Filter = (typeof STATES)[number] | "all";

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

/** RegisteredDomain no tiene relación con User: se buscan los ids por correo. */
async function userIdsFor(q: string): Promise<string[]> {
  const users = await db.user
    .findMany({
      where: { email: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 100,
    })
    .catch(() => []);
  return users.map((user) => user.id);
}

export default async function AdminDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; p?: string; msg?: string; error?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("domains:view")) {
    return <AccessDenied permission="domains:view" />;
  }
  const params = await searchParams;
  const q = searchTerm(params.q);
  const filter: Filter = (STATES as readonly string[]).includes(params.estado ?? "")
    ? (params.estado as Filter)
    : "all";
  const search: Prisma.RegisteredDomainWhereInput = q
    ? {
        OR: [
          { domain: { contains: q, mode: "insensitive" } },
          { userId: { in: await userIdsFor(q) } },
        ],
      }
    : {};
  const where: Prisma.RegisteredDomainWhereInput =
    filter === "all" ? search : { ...search, status: filter };

  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let counts = new Map<string, number>();
  let domains: Prisma.RegisteredDomainGetPayload<{}>[] = [];
  let userById = new Map<string, { email: string; name: string }>();
  try {
    const grouped = await db.registeredDomain.groupBy({ by: ["status"], _count: true });
    counts = new Map(grouped.map((g) => [g.status, g._count]));
    total = await db.registeredDomain.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    domains = await db.registeredDomain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(domains.map((domain) => domain.userId))] } },
      select: { id: true, email: true, name: true },
    });
    userById = new Map(users.map((user) => [user.id, user]));
  } catch (error) {
    failed = loadFailure(error, "dominios");
  }
  const all = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const tab = (label: string, key: Filter, count: number) => ({
    label,
    count,
    active: filter === key,
    href: withQuery("/admin/dominios", { estado: key === "all" ? undefined : key, q }),
  });

  return (
    <>
      <PageHeader
        eyebrow="NEGOCIO"
        title="Dominios"
        description="Los dominios registrados en CaluServers: su estado en el registrador, su vencimiento y su renovación automática."
      />
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
      <div className="toolbar">
        <FilterTabs
          label="Filtrar dominios por estado"
          items={[
            tab("Todos", "all", all),
            tab("Activos", "active", counts.get("active") ?? 0),
            tab("Pendientes", "pending", counts.get("pending") ?? 0),
            tab("Transferencias", "pending_transfer", counts.get("pending_transfer") ?? 0),
            tab("Vencidos", "expired", counts.get("expired") ?? 0),
            tab("Redención", "redemption", counts.get("redemption") ?? 0),
            tab("Cancelados", "cancelled", counts.get("cancelled") ?? 0),
          ]}
        />
        <SearchForm
          action="/admin/dominios"
          value={q}
          placeholder="Dominio o correo del cliente"
          hidden={{ estado: filter === "all" ? "" : filter }}
        />
      </div>
      {failed ? <LoadError what="los dominios" reason={failed} /> : null}
      {!failed && !domains.length ? (
        <EmptyState title={q ? "Ningún dominio coincide con la búsqueda." : "No hay dominios en este estado."} />
      ) : null}
      {domains.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Dominio</th>
                <th scope="col">Cliente</th>
                <th scope="col">Vence</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                // Solo se reintenta un dominio pendiente o con
                // transferencia pendiente (lo que exige el servicio).
                const retryable = domain.status === "pending" || domain.status === "pending_transfer";
                const owner = userById.get(domain.userId);
                return (
                  <tr key={domain.id}>
                    <td>
                      <strong>{domain.domain}</strong>
                      <span className="cell-sub">
                        {domain.registrarKey ?? "porkbun"}
                        {domain.autoRenew ? " · renovación automática" : ""}
                      </span>
                    </td>
                    <td>
                      {owner?.email ? (
                        <Link className="row-link" href={`/admin/clientes/${domain.userId}`}>
                          {owner.email}
                        </Link>
                      ) : (
                        domain.userId
                      )}
                    </td>
                    <td>{domain.expiresAt ? dateOnly(domain.expiresAt) : "—"}</td>
                    <td>
                      <StatusBadge info={domainStatus(domain.status)} />
                      {domain.failureReason ? (
                        <span className="cell-sub error">{domain.failureReason}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {retryable ? (
                          <form method="post" action={`/api/admin/domains/${domain.id}`}>
                            <input type="hidden" name="action" value="retry" />
                            <button className="btn small" type="submit">
                              Reintentar registro
                            </button>
                          </form>
                        ) : null}
                        <form method="post" action={`/api/admin/domains/${domain.id}`}>
                          <input type="hidden" name="action" value="renew" />
                          <button className="btn secondary small" type="submit">
                            Renovar manual
                          </button>
                        </form>
                        <form method="post" action={`/api/admin/domains/${domain.id}`}>
                          <input type="hidden" name="action" value="refresh" />
                          <button className="btn secondary small" type="submit">
                            Ver estado
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pagination
        page={page}
        pages={pages}
        total={total}
        hrefFor={(p) =>
          withQuery("/admin/dominios", { estado: filter === "all" ? undefined : filter, q, p })
        }
      />
    </>
  );
}
