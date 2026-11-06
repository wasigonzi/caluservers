import { useState } from "react";
import type { FormEvent } from "react";
import { ABUSE_CATEGORIES } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import {
  PageHero,
  openWhmcsTicket,
  useDocumentTitle,
} from "../components/Layout";

export default function Abuse() {
  useDocumentTitle("Reportar abuso");
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState(ABUSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    openWhmcsTicket(catalog.settings.whmcs, [
      { label: "Nombre", value: name },
      { label: "Email", value: email },
      { label: "Dominio o IP involucrada", value: target },
      { label: "Categoría de abuso", value: category },
      { label: "Descripción y evidencia", value: description },
    ]);
  }

  return (
    <>
      <PageHero
        kicker="Trust & Safety"
        title={
          <>
            Reportar <span className="neon-text">abuso.</span>
          </>
        }
        lead="Reporta spam, phishing, malware, infracción de copyright o abuso de red."
      />
      <section className="wrap">
        <form className="formbox glass" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="a-name">Tu nombre</label>
            <input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-email">Email</label>
            <input
              id="a-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-target">Dominio o IP involucrada</label>
            <input
              id="a-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="a-cat">Categoría de abuso</label>
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
            <label htmlFor="a-desc">
              Descripción detallada y enlaces de evidencia
            </label>
            <textarea
              id="a-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <button className="btn primary" type="submit">
            Enviar reporte
          </button>
          <p className="muted">
            Los reportes se canalizan a nuestro buzón de abuso monitoreado.
          </p>
        </form>
      </section>
    </>
  );
}
