"use client";
import { useCopy, usePageCopy } from "@/lib/page-content-context";
import { pc } from "@/lib/page-content";
import { INCLUDED_BENEFITS, TECH_SPECS } from "@/lib/catalog";
const iconHosting = "/icons/servicio-hosting.svg";
const iconRed = "/icons/servicio-red.svg";
const iconSeguridad = "/icons/servicio-seguridad.svg";
const iconSoporte = "/icons/servicio-soporte.svg";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero, PlanCard } from "@/components/site/SiteShell";
import { HostingQuiz } from "@/components/site/HostingQuiz";
import { Faq, SectionHead } from "@/components/site/Sections";

export default function WebHosting() {
    
  const kicker = useCopy("kicker", "Web Hosting");
  const title = useCopy("title", "Hosting web rápido con cPanel");
  const titleAccent = useCopy("titleAccent", "y SSL gratis");
  const lead = useCopy("lead", "Alojamiento sencillo, seguro y rápido para cada etapa de tu trayectoria en línea.");
  const faqKicker = useCopy("faqKicker", "Preguntas frecuentes");
  const faqTitle = useCopy("faqTitle", "Hosting sin sorpresas");
  const payload = usePageCopy();
  const faq = Array.from({ length: 6 }, (_, idx) => {
    const i = idx + 1;
    return {
      q: pc(payload, `faq${i}q`, ""),
      a: pc(payload, `faq${i}a`, ""),
    };
  }).filter((x) => x.q && x.a);

const { catalog } = useCatalog();
  const plans = catalog.webHosting.filter((p) => p.active);
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
        <div className="plan-grid">
          {plans.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={i === 1}
              tag={i === 1 ? "Más popular" : "CALUSERVERS"}
            />
          ))}
        </div>
        <section className="section">
          <SectionHead
            kicker="¿Cuál me conviene?"
            title={
              <>
                Encuentra tu plan{" "}
                <span className="neon-text">en 3 preguntas.</span>
              </>
            }
            lead="Sin tecnicismos: responde y te decimos qué plan encaja con lo que necesitas."
          />
          <HostingQuiz plans={catalog.webHosting} />
        </section>
        <section className="section">
          <SectionHead
            kicker="Qué incluye"
            title={
              <>
                Todo lo esencial,{" "}
                <span className="neon-text">sin pagar aparte.</span>
              </>
            }
            lead="Cada plan de Web Hosting trae lo mismo en lo básico: panel, instalador, seguridad y correo."
          />
          <div className="detail-grid">
            <article className="detail-card glass">
              <div className="icon-chip">
                <img src={iconHosting} alt="" />
              </div>
              <div>
                <h3>cPanel incluido</h3>
                <p>
                  Gestiona dominios, correo, bases de datos MySQL y archivos
                  desde el panel de control más usado del mundo.
                </p>
              </div>
            </article>
            <article className="detail-card glass">
              <div className="icon-chip">
                <img src={iconRed} alt="" />
              </div>
              <div>
                <h3>Softaculous Premium · 250+ scripts</h3>
                <p>
                  WordPress y más de 250 aplicaciones se instalan en un clic,
                  con el plugin LiteSpeed Cache listo para activar.
                </p>
              </div>
            </article>
            <article className="detail-card glass">
              <div className="icon-chip">
                <img src={iconSeguridad} alt="" />
              </div>
              <div>
                <h3>SSL gratis y cuentas aisladas</h3>
                <p>
                  Certificado SSL de Let&apos;s Encrypt que se renueva solo, y
                  CageFS mantiene cada cuenta en su propio espacio, aislada
                  de los demás sitios del servidor.
                </p>
              </div>
            </article>
            <article className="detail-card glass">
              <div className="icon-chip">
                <img src={iconSoporte} alt="" />
              </div>
              <div>
                <h3>Correo y soporte 24/7</h3>
                <p>
                  Cuentas de correo con tu dominio (100 en Starter,
                  ilimitadas en Professional y Business) y soporte por ticket
                  en inglés y español, todos los días del año.
                </p>
              </div>
            </article>
          </div>
        </section>
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
        <section className="section">
          <SectionHead
            kicker={faqKicker}
            title={<>{faqTitle}</>}
          />
          <Faq items={faq} />
        </section>
      </section>
    </>
  );
}
