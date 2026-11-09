import Link from "next/link";
import { OrderButton } from "@/components/account/AccountForms";
import { parsePublicPriceToCents } from "@/lib/commerce";
import { getCatalogPayload } from "@/lib/catalog-db";
import { isOrderablePlan } from "@/lib/orderable";
import { customerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

export default async function HirePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId = "" } = await searchParams;
  const session = await customerSession();
  const catalog = await getCatalogPayload();
  const plan = [...catalog.webHosting, ...catalog.vps, ...catalog.dedicated].find((item) => item.id === planId);
  const cents = plan ? parsePublicPriceToCents(plan.price) : null;
  const orderable = Boolean(plan && isOrderablePlan(plan) && cents);
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Contratar</h1>
      {!orderable ? <p className="error">Ese plan no tiene contratación nativa.</p> : null}
      {orderable && plan && cents ? (
        <>
          <p>{plan.name}</p>
          <p>Precio de lista: {cents} centavos por mes. El servidor calcula el total. No se cobra en esta página.</p>
          <p className="muted">La moneda y los impuestos dependen de la configuración del propietario. Si faltan, el pedido queda como proforma no cobrable.</p>
        </>
      ) : null}
      {!session?.user.emailVerified ? <p><Link href="/cuenta/entrar">Entra con el correo verificado para continuar.</Link></p> : null}
      {session?.user.emailVerified && orderable ? <OrderButton planId={planId} /> : null}
    </main>
  );
}
