"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { TLDS } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";
import { SectionHead, Steps } from "@/components/site/Sections";

export default function Domains() {
    const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(
    "La disponibilidad se verifica en el portal de cliente (WHMCS), con tu registrador de dominios.",
  );

  /** Quita la extensión conocida al final del nombre, si la tiene. */
  function stripTld(value: string): string {
    const v = value.trim();
    for (const t of TLDS) {
      if (v.toLowerCase().endsWith(t)) return v.slice(0, v.length - t.length);
    }
    return v;
  }

  /** Rellena el buscador con la extensión elegida (reemplaza la anterior). */
  function applyTld(tld: string) {
    const base = stripTld(name);
    if (!base) {
      // Sin nombre todavía: deja la extensión y el cursor delante para
      // que se escriba el nombre antes de ella.
      setName(tld);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(0, 0);
      });
      return;
    }
    setName(`${base}${tld}`);
    inputRef.current?.focus();
  }

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
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Escribe tu dominio perfecto"
            required
          />
          <button className="btn primary" type="submit">
            Buscar dominio →
          </button>
        </form>
        <div
          className="tld-chips"
          role="group"
          aria-label="Extensiones de dominio"
        >
          <span className="muted">Extensión:</span>
          {TLDS.map((tld) => (
            <button
              key={tld}
              type="button"
              className={`tld-chip pill${name.toLowerCase().endsWith(tld) ? " selected" : ""}`}
              aria-pressed={name.toLowerCase().endsWith(tld)}
              onClick={() => applyTld(tld)}
            >
              {tld}
            </button>
          ))}
        </div>
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
            <button
              key={tld}
              type="button"
              className="card glass tld-card"
              onClick={() => applyTld(tld)}
              aria-label={`Usar la extensión ${tld}`}
            >
              <h3>{tld}</h3>
              <p>
                Registro, renovación y transferencia gestionados por tu
                registrador de dominios.
              </p>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
