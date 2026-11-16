"use client";
import Link from "next/link";
import { PageHero } from "@/components/site/SiteShell";
import { useCopy } from "@/lib/page-content-context";

export default function Client() {
  const kicker = useCopy("kicker", "Client Portal");
  const title = useCopy("title", "Tus servicios.");
  const titleAccent = useCopy("titleAccent", "Un solo lugar.");
  const lead = useCopy(
    "lead",
    "Tu cuenta propia de CaluServers: facturación, servicios, dominios y soporte en un solo lugar.",
  );
  const ctaTitle = useCopy("ctaTitle", "Bienvenido al Área de Cliente");
  const ctaLead = useCopy(
    "ctaLead",
    "Inicia sesión o crea una cuenta para gestionar tus servicios.",
  );

  const ctaLabel = useCopy("ctaLabel", "Abrir Área de Cliente").replace(/\s*↗\s*$/, "");

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
          <Link className="btn primary" href="/cuenta/entrar">
            {ctaLabel}
          </Link>
          <Link className="btn secondary" href="/cuenta/registro">
            Crear cuenta
          </Link>
        </div>
      </section>
    </>
  );
}
