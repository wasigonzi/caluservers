import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth";
import { PAGE_SIZE } from "@/lib/admin-data";
import { dateTime, pageNumber, searchTerm, ticketStatus } from "@/lib/admin-format";
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

export const dynamic = "force-dynamic";

const STATES = ["open", "answered", "closed"] as const;
type Filter = (typeof STATES)[number] | "all";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; p?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const params = await searchParams;
  const q = searchTerm(params.q);
  const filter: Filter = (STATES as readonly string[]).includes(params.estado ?? "")
    ? (params.estado as Filter)
    : params.estado === "all" || q
      ? "all"
      : "open";
  const search: Prisma.SupportTicketWhereInput = q
    ? {
        OR: [
          { subject: { contains: q, mode: "insensitive" } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const where: Prisma.SupportTicketWhereInput =
    filter === "all" ? search : { ...search, status: filter };

  let failed = false;
  let total = 0;
  let page = 1;
  let pages = 1;
  let counts = new Map<string, number>();
  let tickets: Prisma.SupportTicketGetPayload<{
    include: { user: true; _count: { select: { messages: true } } };
  }>[] = [];
  try {
    const grouped = await db.supportTicket.groupBy({ by: ["status"], _count: true });
    counts = new Map(grouped.map((g) => [g.status, g._count]));
    total = await db.supportTicket.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    tickets = await db.supportTicket.findMany({
      where,
      include: { user: true, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch {
    failed = true;
  }
  const all = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const tab = (label: string, key: Filter, count: number) => ({
    label,
    count,
    active: filter === key,
    href: withQuery("/admin/tickets", { estado: key === "open" ? undefined : key, q }),
  });

  return (
    <>
      <PageHeader
        eyebrow="SOPORTE"
        title="Tickets"
        description="Conversaciones abiertas por clientes desde su cuenta. «Abierto» significa que espera tu respuesta."
      />
      <div className="toolbar">
        <FilterTabs
          label="Filtrar tickets por estado"
          items={[
            tab("Abiertos", "open", counts.get("open") ?? 0),
            tab("Respondidos", "answered", counts.get("answered") ?? 0),
            tab("Cerrados", "closed", counts.get("closed") ?? 0),
            tab("Todos", "all", all),
          ]}
        />
        <SearchForm
          action="/admin/tickets"
          value={q}
          placeholder="Asunto o correo del cliente"
          hidden={{ estado: filter === "open" ? "" : filter }}
        />
      </div>
      {failed ? <LoadError what="los tickets" /> : null}
      {!failed && !tickets.length ? (
        <EmptyState title={q ? "Ningún ticket coincide con la búsqueda." : "No hay tickets en este estado."} />
      ) : null}
      {tickets.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Asunto</th>
                <th scope="col">Cliente</th>
                <th scope="col">Mensajes</th>
                <th scope="col">Estado</th>
                <th scope="col">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link className="row-link" href={`/admin/tickets/${ticket.id}`}>
                      {ticket.subject}
                    </Link>
                  </td>
                  <td>{ticket.user.email}</td>
                  <td>{ticket._count.messages}</td>
                  <td>
                    <StatusBadge info={ticketStatus(ticket.status)} />
                  </td>
                  <td>{dateTime(ticket.updatedAt)}</td>
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
        hrefFor={(p) =>
          withQuery("/admin/tickets", { estado: filter === "open" ? undefined : filter, q, p })
        }
      />
    </>
  );
}
