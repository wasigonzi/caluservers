import Link from "next/link";
import { AccountFrame } from "@/components/account/AccountFrame";
import { OrderButton } from "@/components/account/AccountForms";
import { FiscalNotice } from "@/components/account/FiscalNotice";
import { billingPolicy, parsePublicPriceToCents } from "@/lib/commerce";
import { getCatalogPayload } from "@/lib/catalog-db";
import { formatMinorAmount } from "@/lib/money";
import { isOrderablePlan } from "@/lib/orderable";
import { customerSession } from "@/lib/customer-session";
import { loadOrExplain } from "@/lib/storage-status";

export const dynamic = "force-dynamic";

export default async function HirePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId = "" } = await searchParams;
  const sessionResult = await loadOrExplain(() => customerSession());
  const session = sessionResult.ok ? sessionResult.data : null;
  const catalog = await getCatalogPayload();
  const plan = [...catalog.webHosting, ...catalog.vps, ...catalog.dedicated].find((item) => item.id === planId);
  const cents = plan ? parsePublicPriceToCents(plan.price) : null;
  const orderable = Boolean(plan && isOrderablePlan(plan) && cents);
  const policy = billingPolicy();
  const currency = "currency" in policy ? policy.currency : null;
  const listPrice = cents !== null && currency ? formatMinorAmount(cents, currency) : null;
  return (
    <AccountFrame
      kicker="Contratar"
      title={plan ? plan.name : "Plan no disponible"}
      lead="El precio de lista se muestra en dólares. Crear el pedido no cobra ni da de alta el servicio."
    >
      {!orderable ? <p className="error" role="alert">Ese plan no tiene contratación nativa.</p> : null}
      {orderable && plan ? (
        <section className="account-card glass">
          {plan.description ? <p>{plan.description}</p> : null}
          {listPrice ? (
            <p className="account-price" data-testid="list-price">
              Precio de lista: {listPrice} al mes. El servidor calcula el total y esta pantalla lo muestra en dólares. No se cobra aquí.
            </p>
          ) : (
            <p className="error" role="alert">El importe no se muestra porque la moneda comercial USD no está aplicada en este entorno.</p>
          )}
          <FiscalNotice />
          {currency && session?.user.emailVerified ? <OrderButton planId={planId} /> : null}
          {!session?.user.emailVerified ? <p><Link href="/cuenta/entrar">Entra con el correo verificado para continuar.</Link></p> : null}
        </section>
      ) : null}
    </AccountFrame>
  );
}
