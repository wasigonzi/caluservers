"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero, openWhmcsTicket } from "@/components/site/SiteShell";
import { useCopy } from "@/lib/page-content-context";

export default function Contact() {
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("Ventas");
  const [message, setMessage] = useState("");
  const kicker = useCopy("kicker", "Contacto");
  const title = useCopy("title", "Hablemos.");
  const lead = useCopy("lead", catalog.settings.content.contactLead);
  const submitLabel = useCopy("submitLabel", "Continuar en el portal");
  const formNote = useCopy(
    "formNote",
    "No se envía correo desde esta web. El botón abre el portal externo con el texto para que crees el ticket allí.",
  );
  const labelName = useCopy("labelName", "Nombre");
  const labelEmail = useCopy("labelEmail", "Email");
  const labelDept = useCopy("labelDept", "Departamento");
  const labelMessage = useCopy("labelMessage", "Mensaje");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    openWhmcsTicket(catalog.settings.whmcs, [
      { label: labelName, value: name },
      { label: labelEmail, value: email },
      { label: labelDept, value: dept },
      { label: labelMessage, value: message },
    ]);
  }

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
        <form className="formbox glass" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="c-name">{labelName}</label>
            <input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-email">{labelEmail}</label>
            <input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-dept">{labelDept}</label>
            <select
              id="c-dept"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            >
              <option>Ventas</option>
              <option>Apoyo técnico</option>
              <option>Facturación</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-msg">{labelMessage}</label>
            <textarea
              id="c-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button className="btn primary" type="submit">
            {submitLabel}
          </button>
          <p className="muted">{formNote}</p>
          <p className="notice">
            Este sitio no envía correos ni tickets. El botón abre el portal de
            cliente en otra pestaña.
          </p>
        </form>
      </section>
    </>
  );
}
