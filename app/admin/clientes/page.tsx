import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth";
import { loadFailure, PAGE_SIZE, type LoadFailure } from "@/lib/admin-data";
import { dateOnly, money, pageNumber, searchTerm } from "@/lib/admin-format";
import { db } from "@/lib/db";
import {
  EmptyState,
  LoadError,
  PageHeader,
  Pagination,
  SearchForm,
  StatusBadge,
  withQuery,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const params = await searchParams;
  const q = searchTerm(params.q);
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let rows: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    orders: number;
    paid: Map<string, number>;
  }[] = [];
  try {
    total = await db.user.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { orders: true } } },
    });
    const paidInvoices = users.length
      ? await db.customerInvoice.findMany({
          where: { userId: { in: users.map((u) => u.id) }, status: "paid" },
          select: { userId: true, totalCents: true, currency: true },
        })
      : [];
    rows = users.map((user) => {
      const paid = new Map<string, number>();
      for (const invoice of paidInvoices) {
        if (invoice.userId !== user.id) continue;
        paid.set(invoice.currency, (paid.get(invoice.currency) ?? 0) + invoice.totalCents);
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        orders: user._count.orders,
        paid,
      };
    });
  } catch (error) {
    failed = loadFailure(error, "clientes");
  }

  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTES"
        title="Clientes"
        description="Cuentas registradas en tu área de clientes propia."
      />
      <div className="toolbar">
        <SearchForm action="/admin/clientes" value={q} placeholder="Buscar por nombre o correo" />
      </div>
      {failed ? <LoadError what="los clientes" reason={failed} /> : null}
      {!failed && !rows.length ? (
        <EmptyState title={q ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes."}>
          {q ? null : "Aparecerán aquí cuando alguien se registre en /cuenta/registro."}
        </EmptyState>
      ) : null}
      {rows.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Correo</th>
                <th scope="col">Pedidos</th>
                <th scope="col">Pagado</th>
                <th scope="col">Alta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="row-link" href={`/admin/clientes/${row.id}`}>
                      {row.name || row.email}
                    </Link>
                  </td>
                  <td>{row.email}</td>
                  <td>{row.orders}</td>
                  <td>
                    {row.paid.size
                      ? [...row.paid].map(([currency, cents]) => money(cents, currency)).join(" · ")
                      : "—"}
                  </td>
                  <td>{dateOnly(row.createdAt)}</td>
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
        hrefFor={(p) => withQuery("/admin/clientes", { q, p })}
      />
    </>
  );
}
