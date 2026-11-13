import Link from "next/link";
import { OrderButton } from "@/components/account/AccountForms";
import { billingPolicy, parsePublicPriceToCents } from "@/lib/commerce";
import { getCatalogPayload } from "@/lib/catalog-db";
import { isOrderablePlan } from "@/lib/orderable";
import { customerSession } from "@/lib/customer-session";
import { paypalReady } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export default async function HirePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId = "" } = await searchParams;
  const session = await customerSession();
  const catalog = await getCatalogPayload();
  const hosting = catalog.webHosting.find((item) => item.id === planId);
  const plan =
    hosting ?? [...catalog.vps, ...catalog.dedicated].find((item) => item.id === planId);
  const cents = plan ? parsePublicPriceToCents(plan.price) : null;
  const orderable = Boolean(plan && isOrderablePlan(plan) && cents);
  const policy = billingPolicy();
  const paymentReady = paypalReady() && policy.ok;

  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Contratar</h1>
      {!orderable ? <p className="error">Ese plan no tiene contratación nativa.</p> : null}
      {orderable && plan && cents ? (
        <>
          <p>{plan.name}</p>
          <p>
            Precio de lista: {(cents / 100).toFixed(2)} por mes. El total lo calcula el
            servidor con la moneda configurada.
          </p>
          {!policy.ok ? (
            <p className="notice">
              El pedido quedará como proforma no cobrable hasta que el propietario defina la
              moneda y la política de impuestos.
            </p>
          ) : null}
          {policy.ok && !paypalReady() ? (
            <p className="notice">
              El cobro en línea no está activo. Crearás el pedido y un administrador
              confirmará el pago.
            </p>
          ) : null}
        </>
      ) : null}
      {!session?.user.emailVerified ? (
        <p>
          <Link href="/cuenta/entrar">Entra con el correo verificado para continuar.</Link>
        </p>
      ) : null}
      {session?.user.emailVerified && orderable ? (
        <OrderButton
          planId={planId}
          needsDomain={Boolean(hosting)}
          paymentReady={paymentReady}
        />
      ) : null}
    </main>
  );
}
