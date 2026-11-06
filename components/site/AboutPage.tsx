"use client";
import { PageHero } from "@/components/site/SiteShell";
import { SectionHead } from "@/components/site/Sections";
import { useCopy } from "@/lib/page-content-context";

export default function About() {
  const kicker = useCopy("kicker", "Sobre CaluServers");
  const title = useCopy("title", "Negocios de hosting que");
  const titleAccent = useCopy("titleAccent", "confían desde 2013.");
  const lead = useCopy(
    "lead",
    "Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios web, tiendas y aplicaciones en línea con hosting SSD puro, infraestructura de nivel empresarial y soporte 24/7 por ticket que sí responde.",
  );
  const missionTitle = useCopy("missionTitle", "Nuestra misión");
  const missionText = useCopy(
    "missionText",
    "Hacer que la infraestructura de servidores y de alojamiento sea accesible, transparente y escalable.",
  );
  const focusTitle = useCopy("focusTitle", "Nuestro enfoque");
  const focusText = useCopy(
    "focusText",
    "Planes claros, apoyo práctico y opciones de infraestructura que se ajustan a las necesidades del cliente.",
  );
  const promiseTitle = useCopy("promiseTitle", "Nuestra promesa");
  const promiseText = useCopy(
    "promiseText",
    "Detalles honestos sobre el producto y una comunicación de servicio confiable.",
  );
  const storyKicker = useCopy("storyKicker", "Nuestra historia");
  const storyTitle = useCopy("storyTitle", "Desde 2013,");
  const storyTitleAccent = useCopy("storyTitleAccent", "bajo otro nombre.");
  const storyLead = useCopy(
    "storyLead",
    "CaluServers nació como HostZafiro. El nombre cambió; la idea sigue siendo la misma: hosting honesto, infraestructura seria y soporte que responde.",
  );
  const year1 = useCopy("year1", "2013");
  const year1Title = useCopy("year1Title", "El comienzo: HostZafiro");
  const year1Text = useCopy(
    "year1Text",
    "Nuestro comienzo bajo otro nombre, HostZafiro, mantiene sitios web, tiendas y aplicaciones en línea con hosting SSD puro e infraestructura de nivel empresarial.",
  );
  const year2 = useCopy("year2", "Hoy");
  const year2Title = useCopy("year2Title", "CaluServers");
  const year2Text = useCopy(
    "year2Text",
    "Web Hosting con cPanel y LiteSpeed, VPS con Ryzen 9 9950X y NVMe Gen 5 en cuatro ubicaciones de EE. UU., servidores dedicados y registro de dominios, todo bajo una misma marca.",
  );
  const year3 = useCopy("year3", "24/7");
  const year3Title = useCopy("year3Title", "Soporte que sí responde");
  const year3Text = useCopy(
    "year3Text",
    "Soporte por ticket en inglés y español, todos los días del año, con monitoreo proactivo del host y cobertura de soporte.",
  );
  return (
    <>
      <PageHero
        kicker={kicker}
        title={
          <>
            {title}{" "}
            <span className="neon-text">{titleAccent}</span>
          </>
        }
        lead={lead}
      />
      <section className="wrap">
        <div className="cards">
          <div className="card glass">
            <h3>{missionTitle}</h3>
            <p>{missionText}</p>
          </div>
          <div className="card glass">
            <h3>{focusTitle}</h3>
            <p>{focusText}</p>
          </div>
          <div className="card glass">
            <h3>{promiseTitle}</h3>
            <p>{promiseText}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker={storyKicker}
            title={
              <>
                {storyTitle}{" "}
                <span className="neon-text">{storyTitleAccent}</span>
              </>
            }
            lead={storyLead}
          />
          <div className="story-grid">
            <article className="story-card glass">
              <span className="year">{year1}</span>
              <h3>{year1Title}</h3>
              <p>{year1Text}</p>
            </article>
            <article className="story-card glass">
              <span className="year">{year2}</span>
              <h3>{year2Title}</h3>
              <p>{year2Text}</p>
            </article>
            <article className="story-card glass">
              <span className="year">{year3}</span>
              <h3>{year3Title}</h3>
              <p>{year3Text}</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
