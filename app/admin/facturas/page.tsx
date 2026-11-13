import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth";
import { loadFailure, PAGE_SIZE, type LoadFailure } from "@/lib/admin-data";
import { dateOnly, invoiceStatus, money, pageNumber, searchTerm } from "@/lib/admin-format";
import { billingPolicy } from "@/lib/commerce";
import { db } from "@/lib/db";
import { NoteAction } from "@/components/admin/CommerceActions";
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

const STATES = ["issued", "paid", "proforma", "void"] as const;
type Filter = (typeof STATES)[number] | "all";

export default async function InvoicesPage({
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
      : "issued";
  const search: Prisma.CustomerInvoiceWhereInput = q
    ? {
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { order: { domain: { contains: q, mode: "insensitive" } } },
          { order: { planName: { contains: q, mode: "insensitive" } } },
          { order: { user: { email: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  const where: Prisma.CustomerInvoiceWhereInput =
    filter === "all" ? search : { ...search, status: filter };
  const policy = billingPolicy();

  let failed: LoadFailure | null = null;
  let total = 0;
  let page = 1;
  let pages = 1;
  let counts = new Map<string, number>();
  let invoices: Prisma.CustomerInvoiceGetPayload<{
    include: { payment: true; order: { include: { user: true } } };
  }>[] = [];
  try {
    const grouped = await db.customerInvoice.groupBy({ by: ["status"], _count: true });
    counts = new Map(grouped.map((g) => [g.status, g._count]));
    total = await db.customerInvoice.count({ where });
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = pageNumber(params.p, pages);
    invoices = await db.customerInvoice.findMany({
      where,
      include: { payment: true, order: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch (error) {
    failed = loadFailure(error, "facturas");
  }
  const all = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const tab = (label: string, key: Filter, count: number) => ({
    label,
    count,
    active: filter === key,
    href: withQuery("/admin/facturas", { estado: key === "issued" ? undefined : key, q }),
  });

  return (
    <>
      <PageHeader
        eyebrow="COBROS"
        title="Pedidos y facturas"
        description="Cada pedido genera una factura. Confirma aquí los cobros recibidos fuera de PayPal o anula las que no se van a cobrar."
      />
      {!policy.ok ? (
        <p className="notice banner-warn" role="status">
          {policy.error} Hasta entonces no se puede confirmar ningún cobro.
        </p>
      ) : null}
      <div className="toolbar">
        <FilterTabs
          label="Filtrar facturas por estado"
          items={[
            tab("Por cobrar", "issued", counts.get("issued") ?? 0),
            tab("Pagadas", "paid", counts.get("paid") ?? 0),
            tab("Proforma", "proforma", counts.get("proforma") ?? 0),
            tab("Anuladas", "void", counts.get("void") ?? 0),
            tab("Todas", "all", all),
          ]}
        />
        <SearchForm
          action="/admin/facturas"
          value={q}
          placeholder="Número, correo, dominio o plan"
          hidden={{ estado: filter === "issued" ? "" : filter }}
        />
      </div>
      {failed ? <LoadError what="las facturas" reason={failed} /> : null}
      {!failed && !invoices.length ? (
        <EmptyState title={q ? "Ninguna factura coincide con la búsqueda." : "No hay facturas en este estado."} />
      ) : null}
      {invoices.length ? (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Factura</th>
                <th scope="col">Cliente</th>
                <th scope="col">Concepto</th>
                <th scope="col">Total</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const payable = invoice.status === "issued" && !invoice.payment && policy.ok;
                const voidable = !invoice.payment && invoice.status !== "void";
                return (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.number}</strong>
                      <span className="cell-sub">{dateOnly(invoice.createdAt)}</span>
                    </td>
                    <td>
                      <Link className="row-link" href={`/admin/clientes/${invoice.order.userId}`}>
                        {invoice.order.user.email}
                      </Link>
                    </td>
                    <td>
                      {invoice.order.planName}
                      {invoice.order.domain ? <span className="cell-sub">{invoice.order.domain}</span> : null}
                    </td>
                    <td>{money(invoice.totalCents, invoice.currency)}</td>
                    <td>
                      <StatusBadge info={invoiceStatus(invoice.status)} />
                      {invoice.payment ? (
                        <span className="cell-sub">
                          {invoice.payment.provider === "paypal" ? "PayPal" : "Cobro manual"} ·{" "}
                          {dateOnly(invoice.payment.createdAt)}
                        </span>
                      ) : null}
                      {invoice.payment?.provider === "manual" ? (
                        <span className="cell-sub">«{invoice.payment.note}»</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {payable ? (
                          <NoteAction
                            trigger="Confirmar pago"
                            title={`Confirmar el pago de ${invoice.number}`}
                            description={`Registra que recibiste ${money(invoice.totalCents, invoice.currency)} de ${invoice.order.user.email}. Crea el servicio pendiente de alta y no se puede deshacer.`}
                            noteLabel="Nota del cobro (cómo y cuándo se recibió)"
                            confirmLabel="Confirmar pago manual"
                            payload={{ action: "confirm-payment", invoiceId: invoice.id }}
                          />
                        ) : null}
                        {voidable ? (
                          <NoteAction
                            trigger="Anular"
                            title={`Anular ${invoice.number}`}
                            description="La factura y su pedido quedan anulados y dejan de poder cobrarse. No se borra nada del histórico."
                            noteLabel="Motivo de la anulación"
                            confirmLabel="Anular factura"
                            payload={{ action: "void-invoice", invoiceId: invoice.id }}
                            tone="danger"
                          />
                        ) : null}
                        {!payable && !voidable ? <span className="muted">—</span> : null}
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
          withQuery("/admin/facturas", { estado: filter === "issued" ? undefined : filter, q, p })
        }
      />
    </>
  );
}
