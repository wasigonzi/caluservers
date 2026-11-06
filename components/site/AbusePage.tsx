"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { ABUSE_CATEGORIES } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero, openWhmcsTicket } from "@/components/site/SiteShell";
import { useCopy } from "@/lib/page-content-context";

export default function Abuse() {
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState(ABUSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
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
    "Los reportes se canalizan a nuestro buzón de abuso monitoreado.",
  );
  const labelName = useCopy("labelName", "Tu nombre");
  const labelEmail = useCopy("labelEmail", "Email");
  const labelTarget = useCopy("labelTarget", "Dominio o IP involucrada");
  const labelCategory = useCopy("labelCategory", "Categoría de abuso");
  const labelDescription = useCopy(
    "labelDescription",
    "Descripción detallada y enlaces de evidencia",
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    openWhmcsTicket(catalog.settings.whmcs, [
      { label: labelName, value: name },
      { label: labelEmail, value: email },
      { label: labelTarget, value: target },
      { label: labelCategory, value: category },
      { label: labelDescription, value: description },
    ]);
  }

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
        <form className="formbox glass" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="a-name">{labelName}</label>
            <input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-email">{labelEmail}</label>
            <input
              id="a-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-target">{labelTarget}</label>
            <input
              id="a-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-cat">{labelCategory}</label>
            <select
              id="a-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {ABUSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="a-desc">{labelDescription}</label>
            <textarea
              id="a-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <button className="btn primary" type="submit">
            {submitLabel}
          </button>
          <p className="muted">{formNote}</p>
        </form>
      </section>
    </>
  );
}
