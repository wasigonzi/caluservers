"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { TLDS } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";
import { SectionHead, Steps } from "@/components/site/Sections";
import { useCopy } from "@/lib/page-content-context";

export default function Domains() {
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchHint = useCopy(
    "searchHint",
    "La disponibilidad se verifica en el portal de cliente (WHMCS), con tu registrador de dominios.",
  );
  const [message, setMessage] = useState(searchHint);

  const kicker = useCopy("kicker", "Domain Registration");
  const title = useCopy("title", "Encuentra");
  const titleAccent = useCopy("titleAccent", "tu lugar en línea.");
  const lead = useCopy(
    "lead",
    "Busca tu dominio y gestiona registros y transferencias desde un solo lugar.",
  );
  const searchPlaceholder = useCopy(
    "searchPlaceholder",
    "Escribe tu dominio perfecto",
  );
  const searchButton = useCopy("searchButton", "Buscar dominio →");
  const stepsKicker = useCopy("stepsKicker", "Cómo funciona");
  const stepsTitle = useCopy("stepsTitle", "Tu dominio,");
  const stepsTitleAccent = useCopy("stepsTitleAccent", "en tres pasos.");
  const stepsLead = useCopy(
    "stepsLead",
    "La búsqueda y la verificación de disponibilidad se hacen en el portal de cliente, con tu registrador de dominios.",
  );
  const stepItems = [
    {
      title: useCopy("step1Title", "Busca tu dominio"),
      text: useCopy(
        "step1Text",
        "Escribe el nombre que quieres en el buscador de arriba, con la extensión que prefieras (.com, .net, .org, .online, .info o .store).",
      ),
    },
    {
      title: useCopy("step2Title", "Verifica la disponibilidad"),
      text: useCopy(
        "step2Text",
        "La disponibilidad se comprueba en el portal de cliente (WHMCS). Si está libre, lo añades al carrito y completas el registro.",
      ),
    },
    {
      title: useCopy("step3Title", "Gestiona todo en un lugar"),
      text: useCopy(
        "step3Text",
        "Registro, renovación y transferencia se gestionan desde tu panel de cliente, junto a tus planes de hosting y VPS.",
      ),
    },
  ];
  const tldCardText = useCopy(
    "tldCardText",
    "Registro, renovación y transferencia gestionados por tu registrador de dominios.",
  );

  function stripTld(value: string): string {
    const v = value.trim();
    for (const t of TLDS) {
      if (v.toLowerCase().endsWith(t)) return v.slice(0, v.length - t.length);
    }
    return v;
  }

  function applyTld(tld: string) {
    const base = stripTld(name);
    if (!base) {
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
        kicker={kicker}
        title={
          <>
            {title} <span className="neon-text">{titleAccent}</span>
          </>
        }
        lead={lead}
      />
      <section className="wrap">
        <form className="domain-search glass" onSubmit={onSearch}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={searchPlaceholder}
            required
          />
          <button className="btn primary" type="submit">
            {searchButton}
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
            kicker={stepsKicker}
            title={
              <>
                {stepsTitle}{" "}
                <span className="neon-text">{stepsTitleAccent}</span>
              </>
            }
            lead={stepsLead}
          />
          <Steps steps={stepItems} />
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
              <p>{tldCardText}</p>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
