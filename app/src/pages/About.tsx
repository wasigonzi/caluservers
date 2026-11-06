import { PageHero, useDocumentTitle } from "../components/Layout";

export default function About() {
  useDocumentTitle("Nosotros");
  return (
    <>
      <PageHero
        kicker="Sobre CaluServers"
        title={
          <>
            Negocios de hosting que{" "}
            <span className="neon-text">confían desde 2013.</span>
          </>
        }
        lead="Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios web, tiendas y aplicaciones en línea con hosting SSD puro, infraestructura de nivel empresarial y soporte 24/7 por ticket que sí responde."
      />
      <section className="wrap">
        <div className="cards">
          <div className="card glass">
            <h3>Nuestra misión</h3>
            <p>
              Hacer que la infraestructura de servidores y de alojamiento sea
              accesible, transparente y escalable.
            </p>
          </div>
          <div className="card glass">
            <h3>Nuestro enfoque</h3>
            <p>
              Planes claros, apoyo práctico y opciones de infraestructura que
              se ajustan a las necesidades del cliente.
            </p>
          </div>
          <div className="card glass">
            <h3>Nuestra promesa</h3>
            <p>
              Detalles honestos sobre el producto y una comunicación de
              servicio confiable.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
