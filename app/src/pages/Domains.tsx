import { useState } from "react";
import type { FormEvent } from "react";
import { TLDS } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, useDocumentTitle } from "../components/Layout";
import { SectionHead, Steps } from "../components/Sections";

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
        <section className="section">
          <SectionHead
            kicker="Cómo funciona"
            title={
              <>
                Tu dominio,{" "}
                <span className="neon-text">en tres pasos.</span>
              </>
            }
            lead="La búsqueda y la verificación de disponibilidad se hacen en el portal de cliente, con tu registrador de dominios."
          />
          <Steps
            steps={[
              {
                title: "Busca tu dominio",
                text: "Escribe el nombre que quieres en el buscador de arriba, con la extensión que prefieras (.com, .net, .org, .online, .info o .store).",
              },
              {
                title: "Verifica la disponibilidad",
                text: "La disponibilidad se comprueba en el portal de cliente (WHMCS). Si está libre, lo añades al carrito y completas el registro.",
              },
              {
                title: "Gestiona todo en un lugar",
                text: "Registro, renovación y transferencia se gestionan desde tu panel de cliente, junto a tus planes de hosting y VPS.",
              },
            ]}
          />
        </section>
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
