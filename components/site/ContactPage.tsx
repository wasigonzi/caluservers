"use client";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";
import IntakeForm from "@/components/site/IntakeForm";
import { useCopy } from "@/lib/page-content-context";

export default function Contact() {
  const { catalog } = useCatalog();
  const kicker = useCopy("kicker", "Contacto");
  const title = useCopy("title", "Hablemos.");
  const lead = useCopy("lead", catalog.settings.content.contactLead);
  const submitLabel = useCopy("submitLabel", "Enviar mensaje");
  const formNote = useCopy(
    "formNote",
    "El mensaje llega a nuestro equipo y te respondemos al correo que indiques.",
  );
  const labelName = useCopy("labelName", "Nombre");
  const labelEmail = useCopy("labelEmail", "Email");
  const labelDept = useCopy("labelDept", "Departamento");
  const labelMessage = useCopy("labelMessage", "Mensaje");

  return (
    <>
      <PageHero kicker={kicker} title={title} lead={lead} />
      <section className="wrap">
        {(catalog.settings.contact.email ||
          catalog.settings.contact.phone ||
          catalog.settings.contact.hours) && (
          <div className="glass notice contact-details" style={{ marginBottom: 18 }}>
            {catalog.settings.contact.email ? (
              <p>
                Email:{" "}
                <a href={`mailto:${catalog.settings.contact.email}`}>
                  {catalog.settings.contact.email}
                </a>
              </p>
            ) : null}
            {catalog.settings.contact.phone ? (
              <p>
                Teléfono:{" "}
                <a href={`tel:${catalog.settings.contact.phone.replace(/\s/g, "")}`}>
                  {catalog.settings.contact.phone}
                </a>
              </p>
            ) : null}
            {catalog.settings.contact.hours ? (
              <p>{catalog.settings.contact.hours}</p>
            ) : null}
          </div>
        )}
        <IntakeForm
          kind="contact"
          note={formNote}
          labels={{
            name: labelName,
            email: labelEmail,
            topic: labelDept,
            message: labelMessage,
            submit: submitLabel,
          }}
        />
      </section>
    </>
  );
}
