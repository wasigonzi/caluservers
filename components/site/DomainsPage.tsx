"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { TLDS } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero } from "@/components/site/SiteShell";
import { SectionHead, Steps } from "@/components/site/Sections";
import { useCopy } from "@/lib/page-content-context";

type Lookup =
  | { state: "idle" }
  | { state: "checking"; domain: string }
  | { state: "available"; domain: string }
  | { state: "registered"; domain: string }
  | { state: "unverified"; domain: string; reason?: string }
  | { state: "error"; message: string };

const UNVERIFIED_REASONS: Record<string, string> = {
  "no-bootstrap": "No se pudo contactar el directorio de registros.",
  "no-server": "Esa extensión no publica un servidor de consulta.",
  "rate-limited": "El registro limitó las consultas por ahora.",
  unreachable: "El registro no respondió a tiempo.",
  "bad-response": "El registro devolvió una respuesta que no se pudo leer.",
};

export default function Domains() {
  const { catalog } = useCatalog();
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const searchHint = useCopy(
    "searchHint",
    "Comprobamos la disponibilidad en el registro oficial de la extensión. El registro se completa en el portal de cliente.",
  );

  const kicker = useCopy("kicker", "Domain Registration");
  const title = useCopy("title", "Encuentra");
  const titleAccent = useCopy("titleAccent", "tu lugar en línea.");
  const lead = useCopy(
    "lead",
    "Escribe el dominio que quieres y te decimos si está libre. El registro y la renovación se gestionan en tu panel de cliente.",
  );
  const searchPlaceholder = useCopy("searchPlaceholder", "Escribe tu dominio perfecto");
  const searchButton = useCopy("searchButton", "Comprobar");
  const stepsKicker = useCopy("stepsKicker", "Cómo funciona");
  const stepsTitle = useCopy("stepsTitle", "Tu dominio,");
  const stepsTitleAccent = useCopy("stepsTitleAccent", "en tres pasos.");
  const stepsLead = useCopy(
    "stepsLead",
    "La comprobación ocurre aquí; el pago y el registro, en el portal de cliente.",
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
        "Consultamos el registro oficial de la extensión y te decimos si está libre, ocupado o si el registro no respondió.",
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

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = name.trim();
    if (!query || lookup.state === "checking") return;
    setLookup({ state: "checking", domain: query });
    try {
      const response = await fetch(`/api/domains?name=${encodeURIComponent(query)}`);
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; domain?: string; state?: string; reason?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.domain) {
        setLookup({
          state: "error",
          message: payload?.error || "No se pudo comprobar el dominio.",
        });
        return;
      }
      if (payload.state === "available" || payload.state === "registered") {
        setLookup({ state: payload.state, domain: payload.domain });
        return;
      }
      setLookup({ state: "unverified", domain: payload.domain, reason: payload.reason });
    } catch {
      setLookup({ state: "error", message: "No hubo conexión al comprobar el dominio." });
    }
  }

  const registerUrl = (domain: string) =>
    `${catalog.settings.whmcs}/cart.php?a=add&domain=register&query=${encodeURIComponent(domain)}`;

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
            onChange={(e) => {
              setName(e.target.value);
              if (lookup.state !== "idle") setLookup({ state: "idle" });
            }}
            placeholder={searchPlaceholder}
            maxLength={255}
            required
          />
          <button className="btn primary" type="submit" disabled={lookup.state === "checking"}>
            {lookup.state === "checking" ? "Comprobando…" : searchButton}
          </button>
        </form>
        <div className="tld-chips" role="group" aria-label="Extensiones de dominio">
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
        <div className="notice" id="domain-result" role="status" aria-live="polite">
          {lookup.state === "idle" ? <p>{searchHint}</p> : null}
          {lookup.state === "checking" ? <p>Comprobando {lookup.domain}…</p> : null}
          {lookup.state === "available" ? (
            <p>
              <strong>{lookup.domain} está libre.</strong>{" "}
              <a className="btn primary" href={registerUrl(lookup.domain)} rel="noopener">
                Registrarlo en el portal ↗
              </a>
            </p>
          ) : null}
          {lookup.state === "registered" ? (
            <p>
              <strong>{lookup.domain} ya está registrado.</strong> Prueba otra extensión o otro
              nombre.
            </p>
          ) : null}
          {lookup.state === "unverified" ? (
            <p>
              No pudimos confirmar {lookup.domain}.{" "}
              {UNVERIFIED_REASONS[lookup.reason ?? ""] || "El registro no respondió."}{" "}
              <a href={registerUrl(lookup.domain)} rel="noopener">
                Comprobarlo en el portal ↗
              </a>
            </p>
          ) : null}
          {lookup.state === "error" ? <p>{lookup.message}</p> : null}
        </div>
        <section className="section">
          <SectionHead
            kicker={stepsKicker}
            title={
              <>
                {stepsTitle} <span className="neon-text">{stepsTitleAccent}</span>
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
