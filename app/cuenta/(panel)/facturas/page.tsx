import Link from "next/link";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly, customerInvoiceStatus, money } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

export default async function AccountInvoices() {
  const user = await requireCustomer();
  const invoices = await db.customerInvoice.findMany({
    where: { userId: user.id },
    include: { order: true, payment: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title="Facturas"
        description="Cada pedido genera una factura. Ábrela para ver el detalle, pagarla o imprimirla."
      />
      {!invoices.length ? (
        <EmptyState title="Todavía no tienes facturas.">
          Se crea una al contratar un plan.{" "}
          <Link className="row-link" href="/web-hosting">
            Ver planes
          </Link>
        </EmptyState>
      ) : (
        <div className="table-wrap stack">
          <table>
            <thead>
              <tr>
                <th scope="col">Factura</th>
                <th scope="col">Concepto</th>
                <th scope="col">Fecha</th>
                <th scope="col">Total</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link className="row-link" href={`/cuenta/facturas/${invoice.id}`}>
                      {invoice.number}
                    </Link>
                  </td>
                  <td>
                    {invoice.order.planName}
                    {invoice.order.domain ? <span className="cell-sub">{invoice.order.domain}</span> : null}
                  </td>
                  <td>{dateOnly(invoice.createdAt)}</td>
                  <td>{money(invoice.totalCents, invoice.currency)}</td>
                  <td>
                    <StatusBadge info={customerInvoiceStatus(invoice.status)} />
                  </td>
                  <td>
                    <Link
                      className={invoice.status === "issued" ? "btn small" : "btn secondary small"}
                      href={`/cuenta/facturas/${invoice.id}`}
                    >
                      {invoice.status === "issued" ? "Pagar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
