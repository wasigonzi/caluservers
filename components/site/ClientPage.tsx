"use client";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";

export default function Client() {
    const { catalog } = useCatalog();
  return (
    <>
      <PageHero
        kicker="Client Portal"
        title={
          <>
            Tus servicios. <span className="neon-text">Un solo lugar.</span>
          </>
        }
        lead="Accede a facturación, servicios, dominios y soporte a través del portal de cliente de CaluServers."
      />
      <section className="wrap">
        <div className="glass wide-cta">
          <div>
            <h2>Bienvenido al Área de Cliente</h2>
            <p className="muted">
              Inicia sesión o crea una cuenta en nuestro portal de cliente
              (WHMCS).
            </p>
          </div>
          <a className="btn primary" href={catalog.settings.whmcs}>
            Abrir Área de Cliente ↗
          </a>
        </div>
      </section>
    </>
  );
}
