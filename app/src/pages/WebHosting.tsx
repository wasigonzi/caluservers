import { INCLUDED_BENEFITS, TECH_SPECS } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, PlanCard, useDocumentTitle } from "../components/Layout";

export default function WebHosting() {
  useDocumentTitle("Web Hosting");
  const { catalog } = useCatalog();
  return (
    <>
      <PageHero
        kicker="Web Hosting"
        title={
          <>
            Alojamiento que{" "}
            <span className="neon-text">te mantiene en marcha.</span>
          </>
        }
        lead="Alojamiento sencillo, seguro y rápido para cada etapa de tu trayectoria en línea."
      />
      <section className="wrap">
        <div className="plan-grid">
          {catalog.webHosting.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={i === 1}
              tag={i === 1 ? "Más popular" : "CALUSERVERS"}
            />
          ))}
        </div>
        <section className="section">
          <div className="section-head">
            <span className="kicker">Incluido en todos los planes</span>
            <h2>Especificaciones técnicas completas</h2>
            <p>Lo que incluye cada cuenta de hosting compartido.</p>
          </div>
          <div className="tech-grid">
            {TECH_SPECS.map((t) => (
              <div key={t} className="tech-item glass">
                <b>{t}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="section">
          <div className="section-head">
            <span className="kicker">Más valor en cada cuenta</span>
            <h2>Lo que trae cada plan</h2>
            <p>Lo básico viene incluido. No se paga aparte.</p>
          </div>
          <div className="included-grid">
            {INCLUDED_BENEFITS.map((b) => (
              <article key={b.title} className="included-card glass">
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
