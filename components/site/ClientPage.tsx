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
    "Puedes usar la cuenta propia de CaluServers. El portal anterior sigue disponible y no se ha migrado.",
  );
  const ctaTitle = useCopy("ctaTitle", "Bienvenido al Área de Cliente");
  const ctaLead = useCopy(
    "ctaLead",
    "La cuenta propia vive en esta web. El portal anterior no se desactiva.",
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
