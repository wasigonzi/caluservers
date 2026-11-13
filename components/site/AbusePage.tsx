"use client";
import { PageHero } from "@/components/site/SiteShell";
import IntakeForm from "@/components/site/IntakeForm";
import { useCopy } from "@/lib/page-content-context";

export default function Abuse() {
  const kicker = useCopy("kicker", "Trust & Safety");
  const title = useCopy("title", "Reportar");
  const titleAccent = useCopy("titleAccent", "abuso.");
  const lead = useCopy(
    "lead",
    "Reporta spam, phishing, malware, infracción de copyright o abuso de red.",
  );
  const submitLabel = useCopy("submitLabel", "Enviar reporte");
  const formNote = useCopy(
    "formNote",
    "El reporte queda registrado con fecha y lo revisa nuestro equipo de Trust & Safety.",
  );
  const labelName = useCopy("labelName", "Tu nombre");
  const labelEmail = useCopy("labelEmail", "Email");
  const labelTarget = useCopy("labelTarget", "Dominio o IP involucrada");
  const labelCategory = useCopy("labelCategory", "Categoría de abuso");
  const labelDescription = useCopy(
    "labelDescription",
    "Descripción detallada y enlaces de evidencia",
  );

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
        <IntakeForm
          kind="abuse"
          note={formNote}
          labels={{
            name: labelName,
            email: labelEmail,
            topic: labelCategory,
            target: labelTarget,
            message: labelDescription,
            submit: submitLabel,
          }}
        />
      </section>
    </>
  );
}
