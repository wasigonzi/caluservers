import type { LegalSection } from "../lib/catalog";
import { LEGAL_AUP, LEGAL_PRIVACY, LEGAL_TERMS } from "../lib/catalog";
import { PageHero, useDocumentTitle } from "../components/Layout";

function LegalArticle({
  kicker,
  title,
  intro,
  sections,
}: {
  kicker: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  useDocumentTitle(title);
  return (
    <>
      <PageHero kicker={kicker} title={title} lead={intro} />
      <section className="wrap">
        <article className="content glass">
          {sections.map((s) => (
            <div key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.text}</p>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}

export function Terms() {
  return (
    <LegalArticle
      kicker="CaluServers Legal"
      title="Términos y Condiciones"
      intro="Por favor revisa estas políticas antes de pedir o usar nuestros servicios."
      sections={LEGAL_TERMS}
    />
  );
}

export function Privacy() {
  return (
    <LegalArticle
      kicker="CaluServers Legal"
      title="Política de Privacidad"
      intro="Por favor revisa estas políticas antes de pedir o usar nuestros servicios."
      sections={LEGAL_PRIVACY}
    />
  );
}

export function Aup() {
  return (
    <LegalArticle
      kicker="CaluServers Legal"
      title="Política de Uso Aceptable"
      intro="Por favor revisa estas políticas antes de pedir o usar nuestros servicios."
      sections={LEGAL_AUP}
    />
  );
}
