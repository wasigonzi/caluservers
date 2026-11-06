import { useState } from "react";
import type { FormEvent } from "react";
import { useCatalog } from "../lib/useCatalog";
import {
  PageHero,
  openWhmcsTicket,
  useDocumentTitle,
} from "../components/Layout";

export default function Contact() {
  useDocumentTitle("Contacto");
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("Ventas");
  const [message, setMessage] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    openWhmcsTicket(catalog.settings.whmcs, [
      { label: "Nombre", value: name },
      { label: "Email", value: email },
      { label: "Departamento", value: dept },
      { label: "Mensaje", value: message },
    ]);
  }

  return (
    <>
      <PageHero
        kicker="Contacto"
        title="Hablemos."
        lead={catalog.settings.content.contactLead}
      />
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
            <label htmlFor="c-name">Nombre</label>
            <input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-email">Email</label>
            <input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-dept">Departamento</label>
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
            <label htmlFor="c-msg">Mensaje</label>
            <textarea
              id="c-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button className="btn primary" type="submit">
            Enviar mensaje
          </button>
          <p className="muted">
            Tu mensaje abre un ticket en nuestro portal de cliente, donde el
            equipo te responde.
          </p>
        </form>
      </section>
    </>
  );
}
