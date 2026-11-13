import Link from "next/link";
import { notFound } from "next/navigation";
import { PayInvoiceButton, PrintButton } from "@/components/account/AccountForms";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly, customerInvoiceStatus, money } from "@/lib/admin-format";
import { paymentInstructions } from "@/lib/billing-settings";
import { billingPolicy } from "@/lib/commerce";
import { db } from "@/lib/db";
import { paypalReady } from "@/lib/paypal";
import { StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factura" };

export default async function AccountInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  // El dueño va en la consulta: una factura ajena es un 404.
  const invoice = await db.customerInvoice.findFirst({
    where: { id, userId: user.id },
    include: { lines: true, payment: true, order: true },
  });
  if (!invoice) notFound();
  const paid = invoice.payment?.status === "confirmed";
  const payable = invoice.status === "issued" && !paid;
  const online = payable && paypalReady() && billingPolicy().ok;
  const instructions = payable ? await paymentInstructions() : "";

  return (
    <>
      <p className="back-link no-print">
        <Link href="/cuenta/facturas">← Facturas</Link>
      </p>
      <article className="panel invoice-doc">
        <header className="invoice-head">
          <div>
            <p className="studio-eyebrow">FACTURA</p>
            <h1>{invoice.number}</h1>
            <p className="muted">Emitida el {dateOnly(invoice.createdAt)}</p>
          </div>
          <div className="invoice-status">
            <StatusBadge info={customerInvoiceStatus(invoice.status)} />
            <PrintButton />
          </div>
        </header>
        <dl className="invoice-parties">
          <div>
            <dt>Cliente</dt>
            <dd>{user.name}</dd>
            <dd className="muted">{user.email}</dd>
          </div>
          <div>
            <dt>Servicio</dt>
            <dd>{invoice.order.planName}</dd>
            {invoice.order.domain ? <dd className="muted">{invoice.order.domain}</dd> : null}
          </div>
        </dl>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Precio</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unitCents, invoice.currency)}</td>
                  <td>{money(line.totalCents, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="invoice-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(invoice.subtotalCents, invoice.currency)}</dd>
          </div>
          <div>
            <dt>Impuestos</dt>
            <dd>
              {invoice.taxCents === null ? "Por determinar" : money(invoice.taxCents, invoice.currency)}
            </dd>
          </div>
          <div className="invoice-total">
            <dt>Total</dt>
            <dd>{money(invoice.totalCents, invoice.currency)}</dd>
          </div>
        </dl>

        {paid && invoice.payment ? (
          <p className="notice invoice-paid" role="status">
            Pagada el {dateOnly(invoice.payment.createdAt)}
            {invoice.payment.provider === "paypal" ? " con PayPal." : "."} Gracias.
          </p>
        ) : null}
        {invoice.status === "void" ? (
          <p className="muted">Esta factura está anulada y no hay que pagarla.</p>
        ) : null}
        {invoice.status === "proforma" ? (
          <p className="muted">
            Es una proforma: todavía no se puede pagar. Te avisaremos cuando quede emitida.
          </p>
        ) : null}

        {payable ? (
          <section className="invoice-pay no-print" aria-labelledby="pay-title">
            <h2 id="pay-title">Cómo pagar</h2>
            {online ? <PayInvoiceButton invoiceId={invoice.id} /> : null}
            {instructions ? (
              <>
                {online ? <p className="muted">O paga por otro medio:</p> : null}
                <p className="invoice-instructions">{instructions}</p>
                <p className="muted">
                  Indica el número de factura <strong>{invoice.number}</strong> al pagar. Lo
                  confirmamos a mano y tu servicio se activa después.
                </p>
              </>
            ) : null}
            {!online && !instructions ? (
              <p className="muted">
                El pago en línea no está activo.{" "}
                <Link className="row-link" href="/cuenta/tickets">
                  Abre un ticket
                </Link>{" "}
                y te indicamos cómo pagar esta factura.
              </p>
            ) : null}
          </section>
        ) : null}
      </article>
    </>
  );
}
