"use client";
import type { ReactNode } from "react";

/** FAQ con <details>/<summary>: sin estado, accesible, estilo frosted. */
export function Faq({
  items,
}: {
  items: { q: string; a: string }[];
}) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details key={item.q} className="faq-item glass">
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function SectionHead({
  kicker,
  title,
  lead,
}: {
  kicker: string;
  title: ReactNode;
  lead?: string;
}) {
  return (
    <div className="section-head">
      <span className="kicker">{kicker}</span>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}

/**
 * Tira de confianza: hechos reales del catálogo en una cinta que se desplaza.
 * La lista se lee una vez; las repeticiones que hacen el bucle son decorativas.
 * Se detiene al pasar el cursor o al enfocarla, y con reduced-motion no se mueve.
 */
export function TrustStrip({ items }: { items: string[] }) {
  const loops = [0, 1, 2, 3];
  return (
    <div className="trust-strip trust-marquee glass" tabIndex={0} aria-label="Datos de CaluServers">
      <div className="trust-track">
        {loops.map((loop) => (
          <ul key={loop} className="trust-group" aria-hidden={loop > 0 ? true : undefined}>
            {items.map((item) => (
              <li key={item} className="pill">
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/** "Cómo funciona" en 3 pasos numerados. */
export function Steps({
  steps,
}: {
  steps: { title: string; text: string }[];
}) {
  return (
    <div className="steps-grid">
      {steps.map((step, i) => (
        <article key={step.title} className="step-card glass">
          <span className="step-num">{i + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </article>
      ))}
    </div>
  );
}

/** Tabla comparativa genérica (encabezados + filas). */
export function CompareTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { label: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="glass compare-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            {headers.slice(1).map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
