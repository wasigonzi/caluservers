"use client";
import type { LegalSection } from "@/lib/catalog";
import { LEGAL_AUP, LEGAL_PRIVACY, LEGAL_TERMS } from "@/lib/catalog";
import { PageHero } from "@/components/site/SiteShell";
import { useCopy, usePageCopy } from "@/lib/page-content-context";

function sectionsFromCopy(
  payload: Record<string, string>,
  fallback: LegalSection[],
): LegalSection[] {
  const out: LegalSection[] = [];
  for (let i = 1; i <= 12; i++) {
    const heading = payload[`sec${i}Heading`];
    const text = payload[`sec${i}Text`];
    if (typeof heading === "string" && heading.trim() && typeof text === "string" && text.trim()) {
      out.push({ heading, text });
    }
  }
  return out.length ? out : fallback;
}

function LegalArticle({
  fallbackSections,
}: {
  fallbackSections: LegalSection[];
}) {
  const payload = usePageCopy();
  const kicker = useCopy("kicker", "CaluServers Legal");
  const title = useCopy("title", "Legal");
  const intro = useCopy(
    "lead",
    "Por favor revisa estas políticas antes de pedir o usar nuestros servicios.",
  );
  const sections = sectionsFromCopy(payload, fallbackSections);
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
  return <LegalArticle fallbackSections={LEGAL_TERMS} />;
}

export function Privacy() {
  return <LegalArticle fallbackSections={LEGAL_PRIVACY} />;
}

export function Aup() {
  return <LegalArticle fallbackSections={LEGAL_AUP} />;
}
