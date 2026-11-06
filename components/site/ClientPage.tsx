"use client";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";
import { useCopy } from "@/lib/page-content-context";

export default function Client() {
  const { catalog } = useCatalog();
  const kicker = useCopy("kicker", "Client Portal");
  const title = useCopy("title", "Tus servicios.");
  const titleAccent = useCopy("titleAccent", "Un solo lugar.");
  const lead = useCopy(
    "lead",
    "Accede a facturación, servicios, dominios y soporte a través del portal de cliente de CaluServers.",
  );
  const ctaTitle = useCopy("ctaTitle", "Bienvenido al Área de Cliente");
  const ctaLead = useCopy(
    "ctaLead",
    "Inicia sesión o crea una cuenta en nuestro portal de cliente (WHMCS).",
  );
  const ctaLabel = useCopy("ctaLabel", "Abrir Área de Cliente ↗");

  return (
    <>
      <PageHero
        kicker={kicker}
        title={
          <>
            {title} <span className="neon-text">{titleAccent}</span>
          </>
        }
        lead={lead}
      />
      <section className="wrap">
        <div className="glass wide-cta">
          <div>
            <h2>{ctaTitle}</h2>
            <p className="muted">{ctaLead}</p>
          </div>
          <a className="btn primary" href={catalog.settings.whmcs}>
            {ctaLabel}
          </a>
        </div>
      </section>
    </>
  );
}
