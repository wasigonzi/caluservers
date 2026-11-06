import { useState } from "react";
import type { FormEvent } from "react";
import { TLDS } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, useDocumentTitle } from "../components/Layout";

export default function Domains() {
  useDocumentTitle("Registro de dominios");
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [message, setMessage] = useState(
    "La disponibilidad se verifica en el portal de cliente (WHMCS), con tu registrador de dominios.",
  );

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const domain = name.trim();
    if (!domain) return;
    setMessage(`Comprobando ${domain} en el portal de cliente…`);
    window.location.href = `${catalog.settings.whmcs}/cart.php?a=add&domain=register&query=${encodeURIComponent(domain)}`;
  }

  return (
    <>
      <PageHero
        kicker="Domain Registration"
        title={
          <>
            Encuentra <span className="neon-text">tu lugar en línea.</span>
          </>
        }
        lead="Busca tu dominio y gestiona registros y transferencias desde un solo lugar."
      />
      <section className="wrap">
        <form className="domain-search glass" onSubmit={onSearch}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Escribe tu dominio perfecto"
            required
          />
          <button className="btn primary" type="submit">
            Buscar dominio →
          </button>
        </form>
        <p className="notice" id="domain-result">
          {message}
        </p>
        <div className="cards">
          {TLDS.map((tld) => (
            <div key={tld} className="card glass">
              <h3>{tld}</h3>
              <p>
                Registro, renovación y transferencia gestionados por tu
                registrador de dominios.
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
