import type { Metadata } from "next";
import { getPublicCatalog } from "@/lib/catalog-db";
import CheckoutForm from "@/components/site/CheckoutForm";
import { PageHero } from "@/components/site/SiteShell";

export const metadata: Metadata = { title: "Pedir hosting | CaluServers" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const catalog = await getPublicCatalog();
  const plans = catalog.webHosting.filter((p) => p.active);
  const { plan } = await searchParams;
  const selected = plans.find((p) => p.id === plan) ?? null;
  return (
    <>
      <PageHero
        kicker="PEDIDO DE HOSTING"
        title={
          <>
            Pide tu hosting. <span className="neon-text">Nosotros lo creamos.</span>
          </>
        }
        lead="Completa tu pedido y, al confirmarse el pago, tu cuenta cPanel se crea automáticamente. Sin esperas ni gestión manual."
      />
      <section className="wrap">
        <CheckoutForm plans={plans} selectedPlan={selected} />
      </section>
    </>
  );
}
