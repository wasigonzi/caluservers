import { Link } from "react-router-dom";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, PlanCard, useDocumentTitle } from "../components/Layout";

export default function Dedicated() {
  useDocumentTitle("Dedicated Servers");
  const { catalog } = useCatalog();
  return (
    <>
      <PageHero
        kicker="Dedicated Servers"
        title={
          <>
            Bare-metal <span className="neon-text">power.</span>
          </>
        }
        lead="Recursos dedicados y hardware configurable para cargas de trabajo exigentes."
      />
      <section className="wrap">
        <div className="plan-grid five">
          {catalog.dedicated.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={i === 1}
              tag={i === 1 ? "Más popular" : "CALUSERVERS"}
            />
          ))}
        </div>
        <p className="notice glass" style={{ marginTop: 24 }}>
          ¿Necesitas una configuración a medida?{" "}
          <Link to="/contact">Habla con nuestro equipo</Link> y armamos el
          servidor que tu proyecto necesita.
        </p>
      </section>
    </>
  );
}
