"use client";
import { PageHero } from "@/components/site/SiteShell";
import { SectionHead } from "@/components/site/Sections";

export default function About() {
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

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker="Nuestra historia"
            title={
              <>
                Desde 2013,{" "}
                <span className="neon-text">bajo otro nombre.</span>
              </>
            }
            lead="CaluServers nació como HostZafiro. El nombre cambió; la idea sigue siendo la misma: hosting honesto, infraestructura seria y soporte que responde."
          />
          <div className="story-grid">
            <article className="story-card glass">
              <span className="year">2013</span>
              <h3>El comienzo: HostZafiro</h3>
              <p>
                Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios
                web, tiendas y aplicaciones en línea con hosting SSD puro e
                infraestructura de nivel empresarial.
              </p>
            </article>
            <article className="story-card glass">
              <span className="year">Hoy</span>
              <h3>CaluServers</h3>
              <p>
                Web Hosting con cPanel y LiteSpeed, VPS con Ryzen 9 9950X y
                NVMe Gen 5 en cuatro ubicaciones de EE. UU., servidores
                dedicados y registro de dominios, todo bajo una misma marca.
              </p>
            </article>
            <article className="story-card glass">
              <span className="year">24/7</span>
              <h3>Soporte que sí responde</h3>
              <p>
                Soporte por ticket en inglés y español, todos los días del
                año, con monitoreo proactivo del host y cobertura de soporte
                24/7/365 en cada cuenta.
              </p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
