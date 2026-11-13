import Link from "next/link";
import { redirect } from "next/navigation";
import { CapturePayment } from "@/components/account/AccountForms";
import { db } from "@/lib/db";
import { customerSession } from "@/lib/customer-session";
import { paypalReady } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * Vuelta de PayPal. PayPal añade `token` con el id de orden; la factura la
 * pasamos nosotros en la URL de retorno. El cobro se cierra con un clic
 * explícito: así el cliente ve qué se confirma y no se captura por una recarga.
 */
export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; invoice?: string }>;
}) {
  const { token = "", invoice = "" } = await searchParams;
  const session = await customerSession();
  if (!session?.user.emailVerified) redirect("/cuenta/entrar");

  const record = invoice
    ? await db.customerInvoice.findUnique({
        where: { id: invoice },
        include: { payment: true },
      })
    : null;
  const mine = record && record.userId === session.user.id ? record : null;
  const paid = mine?.payment?.status === "confirmed";

  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Confirmar el pago</h1>
      {!paypalReady() ? (
        <p className="error">El cobro con PayPal no está configurado.</p>
      ) : null}
      {!mine ? (
        <p className="error">No encontramos esa factura en tu cuenta.</p>
      ) : null}
      {mine && paid ? (
        <p className="notice" role="status">
          La factura {mine.number} ya está pagada. No hay nada más que hacer aquí.
        </p>
      ) : null}
      {mine && !paid && !token ? (
        <p className="error">
          PayPal no devolvió la referencia del pago. Vuelve a tu cuenta e inténtalo otra vez.
        </p>
      ) : null}
      {mine && !paid && token && paypalReady() ? (
        <>
          <p>
            Factura {mine.number} · {(mine.totalCents / 100).toFixed(2)} {mine.currency}
          </p>
          <CapturePayment invoiceId={mine.id} orderId={token} />
        </>
      ) : null}
      <p>
        <Link href="/cuenta">Volver a tu cuenta</Link>
      </p>
    </main>
  );
}
