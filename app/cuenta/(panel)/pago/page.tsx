import Link from "next/link";
import { redirect } from "next/navigation";
import { CapturePayment, ConfirmStripePayment } from "@/components/account/AccountForms";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";
import { paypalReady } from "@/lib/paypal";
import { stripeReady } from "@/lib/stripe";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Vuelta de la pasarela. PayPal añade `token` con el id de orden y Stripe
 * `session_id` con el id de sesión; la factura la pasamos nosotros en la
 * URL de retorno. El cobro se cierra con un clic explícito: así el cliente
 * ve qué se confirma y no se captura por una recarga.
 */
export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; invoice?: string; session_id?: string }>;
}) {
  const { token = "", invoice = "", session_id: sessionId = "" } = await searchParams;
  const session = await customerSession();
  if (!session?.user) redirect("/cuenta/entrar");

  const record = invoice
    ? await db.customerInvoice.findUnique({
        where: { id: invoice },
        include: { payment: true },
      })
    : null;
  const mine = record && record.userId === session.user.id ? record : null;
  const paid = mine?.payment?.status === "confirmed";
  const paypalOk = paypalReady();
  const stripeOk = await stripeReady();
  const anyOnline = paypalOk || stripeOk;

  return (
    <>
      <PageHeader eyebrow="ÁREA DE CLIENTE" title="Confirmar el pago" />
      <div className="panel">
      {!anyOnline ? (
        <p className="error">El cobro en línea no está activo.</p>
      ) : null}
      {!mine ? (
        <p className="error">No encontramos esa factura en tu cuenta.</p>
      ) : null}
      {mine && paid ? (
        <p className="notice" role="status">
          La factura {mine.number} ya está pagada. No hay nada más que hacer aquí.
        </p>
      ) : null}
      {mine && !paid && !token && !sessionId ? (
        <p className="error">
          La pasarela no devolvió la referencia del pago. Vuelve a tu cuenta e inténtalo otra vez.
        </p>
      ) : null}
      {mine && !paid && token && paypalOk ? (
        <>
          <p>
            Factura {mine.number} · {(mine.totalCents / 100).toFixed(2)} {mine.currency}
          </p>
          <CapturePayment invoiceId={mine.id} orderId={token} />
        </>
      ) : null}
      {mine && !paid && sessionId && stripeOk ? (
        <>
          <p>
            Factura {mine.number} · {(mine.totalCents / 100).toFixed(2)} {mine.currency}
          </p>
          <ConfirmStripePayment invoiceId={mine.id} sessionId={sessionId} />
        </>
      ) : null}
      <p>
        <Link className="row-link" href="/cuenta">Volver a tu cuenta</Link>
      </p>
      </div>
    </>
  );
}
