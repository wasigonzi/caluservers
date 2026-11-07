"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import SafeLink from "@/components/site/SafeLink";
import ServiceFinder from "@/components/site/ServiceFinder";
import SplineHero from "@/components/site/SplineHero";
const iconHosting = "/icons/servicio-hosting.svg";
const iconVps = "/icons/servicio-vps.svg";
const iconDedicados = "/icons/servicio-dedicados.svg";
const iconRed = "/icons/servicio-red.svg";
const iconSeguridad = "/icons/servicio-seguridad.svg";
const iconSoporte = "/icons/servicio-soporte.svg";
import { isPriceToConfirm } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { PlanCard } from "@/components/site/SiteShell";
import type { HomeSectionId } from "@/lib/site-settings";
import CatalogPlanCount from "@/components/site/CatalogPlanCount";
import {
  CompareTable,
  Faq,
  SectionHead,
  Steps,
  TrustStrip,
} from "@/components/site/Sections";
import { useCopy } from "@/lib/page-content-context";

/** Precio mínimo real de una categoría (ignora "$0.00" = precio a confirmar). */
function minPrice(prices: string[]): string {
  const valid = prices
    .filter((p) => !isPriceToConfirm(p))
    .map((p) => parseFloat(p.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n));
  return valid.length > 0 ? `$${Math.min(...valid).toFixed(2)}` : "Consultar";
}

const faq = [
  {
    q: "¿Cómo compro un plan?",
    a: "Elige el plan que te convenga y pulsa «Ordenar». Te lleva al portal de cliente (WHMCS) en client.caluservers.com, donde completas el pedido y el pago de forma segura.",
  },
  {
    q: "¿Cómo recibo soporte si algo falla?",
    a: "El soporte es 24/7 por ticket, en inglés y español. Abre un ticket desde el área de cliente o desde la página de Contacto y el equipo te responde.",
  },
  {
    q: "¿Dónde están ubicados los servidores?",
    a: "Los VPS están disponibles en cuatro ubicaciones de Estados Unidos: Dallas, Los Angeles, New York y Miami. Puedes elegir la más cercana a tus usuarios para minimizar la latencia.",
  },
  {
    q: "¿El VPS incluye acceso root?",
    a: "Sí. Los VPS y los servidores dedicados incluyen acceso root / administrador total: instalas lo que quieras, eliges tu sistema operativo y gestionas el entorno a tu manera.",
  },
  {
    q: "¿Qué sistema operativo puedo elegir?",
    a: "En VPS hay distribuciones Linux disponibles y en los dedicados la selección de sistema operativo es parte de la configuración. También puedes reinstalar y gestionar el servidor desde el panel.",
  },
  {
    q: "¿Qué incluye el Web Hosting?",
    a: "Todos los planes de hosting incluyen cPanel, Softaculous Premium con más de 250 scripts, SSL gratis, cuentas de correo y almacenamiento NVMe SSD. La migración desde cualquier proveedor es gratis.",
  },
];

export default function Home() {
  const { catalog } = useCatalog();
  const statSupportLabel = useCopy("statSupportLabel", "Apoyo técnico");
  const faq = [
    {
      q: useCopy("faq1q", "¿Cómo compro un plan?"),
      a: useCopy(
        "faq1a",
        "Elige el plan que te convenga y pulsa «Ordenar». Te lleva al portal de cliente (WHMCS) en client.caluservers.com, donde completas el pedido y el pago de forma segura.",
      ),
    },
    {
      q: useCopy("faq2q", "¿Cómo recibo soporte si algo falla?"),
      a: useCopy(
        "faq2a",
        "El soporte es 24/7 por ticket, en inglés y español. Abre un ticket desde el área de cliente o desde la página de Contacto y el equipo te responde.",
      ),
    },
    {
      q: useCopy("faq3q", "¿Dónde están ubicados los servidores?"),
      a: useCopy(
        "faq3a",
        "Los VPS están disponibles en cuatro ubicaciones de Estados Unidos: Dallas, Los Angeles, New York y Miami. Puedes elegir la más cercana a tus usuarios para minimizar la latencia.",
      ),
    },
    {
      q: useCopy("faq4q", "¿El VPS incluye acceso root?"),
      a: useCopy(
        "faq4a",
        "Sí. Los VPS y los servidores dedicados incluyen acceso root / administrador total: instalas lo que quieras, eliges tu sistema operativo y gestionas el entorno a tu manera.",
      ),
    },
    {
      q: useCopy("faq5q", "¿Qué sistema operativo puedo elegir?"),
      a: useCopy(
        "faq5a",
        "En VPS hay distribuciones Linux disponibles y en los dedicados la selección de sistema operativo es parte de la configuración. También puedes reinstalar y gestionar el servidor desde el panel.",
      ),
    },
    {
      q: useCopy("faq6q", "¿Qué incluye el Web Hosting?"),
      a: useCopy(
        "faq6a",
        "Todos los planes de hosting incluyen cPanel, Softaculous Premium con más de 250 scripts, SSL gratis, cuentas de correo y almacenamiento NVMe SSD. La migración desde cualquier proveedor es gratis.",
      ),
    },
  ];
  const trustItems = [
    useCopy("trust1", "Desde 2013"),
    useCopy("trust2", "Ryzen 9 9950X"),
    useCopy("trust3", "Protección DDoS"),
    useCopy("trust4", "Soporte en español e inglés"),
  ];
  const stepsKicker = useCopy("stepsKicker", "Cómo funciona");
  const stepsTitle = useCopy(
    "stepsTitle",
    "De la idea al servidor en tres pasos",
  );
  const stepsLead = useCopy(
    "stepsLead",
    "Sin procesos complicados: eliges, compras en el portal seguro y lo gestionas desde tu panel de cliente.",
  );
  const stepItems = [
    {
      title: useCopy("step1Title", "Elige tu plan"),
      text: useCopy(
        "step1Text",
        "Compara Web Hosting, VPS y Dedicados y escoge la configuración que se ajuste a tu proyecto y tu presupuesto.",
      ),
    },
    {
      title: useCopy("step2Title", "Compra segura en WHMCS"),
      text: useCopy(
        "step2Text",
        "El pedido se completa en el portal de cliente de CaluServers, donde también gestionas facturación y renovaciones.",
      ),
    },
    {
      title: useCopy("step3Title", "Gestiónalo desde tu panel"),
      text: useCopy(
        "step3Text",
        "Accede a cPanel, a tu VPS con root total o a tu servidor dedicado, y abre tickets de soporte 24/7 cuando lo necesites.",
      ),
    },
  ];
  const { content, visibility, sections, whmcs } = catalog.settings;
  const enabledLocations = catalog.locations.filter((l) => l.enabled);
  const webMin = minPrice(
    catalog.webHosting.filter((p) => p.active).map((p) => p.price),
  );
  const vpsMin = minPrice(
    catalog.vps.filter((p) => p.active).map((p) => p.price),
  );
  const dedMin = minPrice(
    catalog.dedicated.filter((p) => p.active).map((p) => p.price),
  );
  const featured = [
    ...catalog.webHosting,
    ...catalog.vps,
    ...catalog.dedicated,
  ].filter((p) => p.active && p.featured);

  const blocks: Record<HomeSectionId, ReactNode> = {
    hero: (
      <section className="hero premium-home-hero" key="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow">
              <i className="dot"></i> {content.heroEyebrow}
            </span>
            <h1>
              {content.heroTitle}{" "}
              <span className="neon-text">{content.heroTitleAccent}</span>
            </h1>
            <p className="lead">{content.heroLead}</p>
            <div className="hero-ctas">
              <SafeLink
                className="btn primary"
                href={content.heroCtaPrimaryHref}
                whmcs={whmcs}
              >
                {content.heroCtaPrimary}
              </SafeLink>
              <SafeLink
                className="btn secondary"
                href={content.heroCtaSecondaryHref}
                whmcs={whmcs}
              >
                {content.heroCtaSecondary}
              </SafeLink>
            </div>
            <div className="stats">
              <div className="stat glass">
                <strong>24/7</strong>
                <span>{statSupportLabel}</span>
              </div>
              <div className="stat glass">
                <strong>
                  <CatalogPlanCount
                    count={
                      [
                        ...catalog.webHosting,
                        ...catalog.vps,
                        ...catalog.dedicated,
                      ].filter((p) => p.active).length
                    }
                  />
                </strong>
                <span>Planes disponibles</span>
              </div>
              <div className="stat glass">
                <strong>NVMe</strong>
                <span>Almacenamiento rápido</span>
              </div>
            </div>
          </div>
          <div className="premium-hero-stage">
            <SplineHero />
            <ServiceFinder
              options={[
                {
                  name: "Web Hosting",
                  href: "/web-hosting",
                  price: webMin,
                  count: catalog.webHosting.filter((p) => p.active).length,
                },
                {
                  name: "VPS",
                  href: "/vps",
                  price: vpsMin,
                  count: catalog.vps.filter((p) => p.active).length,
                },
                {
                  name: "Dedicados",
                  href: "/dedicated",
                  price: dedMin,
                  count: catalog.dedicated.filter((p) => p.active).length,
                },
              ]}
            />
          </div>
        </div>
      </section>
    ),
    trustStrip: visibility.trustStrip ? (
      <div className="wrap" key="trust">
        <TrustStrip items={trustItems} />
      </div>
    ) : null,
    services: visibility.services ? (
      <section className="section" key="services">
        <div className="wrap">
          <SectionHead
            kicker={content.servicesKicker}
            title={<>{content.servicesTitle}</>}
            lead={content.servicesLead}
          />
          <div className="cards service-cards">
            <article className="card glass">
              <div className="icon-chip">
                <img src={iconHosting} alt="" />
              </div>
              <h3>Web Hosting</h3>
              <p>
                Alojamiento rápido, seguro y sencillo para sitios personales,
                empresas y marcas en crecimiento.
              </p>
              <p className="card-price">
                Desde <strong>{webMin}</strong>
                <span>/mes</span>
              </p>
              <Link className="btn primary" href="/web-hosting">
                Ver planes →
              </Link>
            </article>
            <article className="card glass">
              <div className="icon-chip">
                <img src={iconVps} alt="" />
              </div>
              <h3>VPS Hosting</h3>
              <p>
                Recursos dedicados, acceso root y configuraciones flexibles de
                servidores virtuales.
              </p>
              <p className="card-price">
                Desde <strong>{vpsMin}</strong>
                <span>/mes</span>
              </p>
              <Link className="btn secondary" href="/vps">
                Ver planes →
              </Link>
            </article>
            <article className="card glass">
              <div className="icon-chip">
                <img src={iconDedicados} alt="" />
              </div>
              <h3>Dedicated Servers</h3>
              <p>
                Potente rendimiento en hardware dedicado para aplicaciones y
                cargas de trabajo exigentes.
              </p>
              <p className="card-price">
                Desde <strong>{dedMin}</strong>
                <span>/mes</span>
              </p>
              <Link className="btn secondary" href="/dedicated">
                Ver planes →
              </Link>
            </article>
          </div>
        </div>
      </section>
    ) : null,
    steps: visibility.steps ? (
      <section className="section" key="steps">
        <div className="wrap">
          <SectionHead
            kicker={stepsKicker}
            title={<>{stepsTitle}</>}
            lead={stepsLead}
          />
          <Steps steps={stepItems} />
        </div>
      </section>
    ) : null,
    compare: visibility.compare ? (
      <section className="section" key="compare">
        <div className="wrap">
          <SectionHead
            kicker="Comparativa"
            title={
              <>
                ¿Web Hosting, VPS o <span className="neon-text">Dedicado?</span>
              </>
            }
            lead="Precios y especificaciones reales del catálogo. Si tu sitio crece, puedes escalar al siguiente nivel."
          />
          <CompareTable
            headers={["", "Web Hosting", "VPS", "Dedicado"]}
            rows={[
              {
                label: "Desde",
                cells: [
                  <span className="best" key="w">
                    {webMin}/mes
                  </span>,
                  <span className="best" key="v">
                    {vpsMin}/mes
                  </span>,
                  <span className="best" key="d">
                    {dedMin}/mes
                  </span>,
                ],
              },
              {
                label: "Acceso root",
                cells: [
                  "No · Panel cPanel",
                  "Sí · Root total",
                  "Sí · Hardware propio",
                ],
              },
              {
                label: "Ideal para",
                cells: [
                  "Sitios web personales y de empresa",
                  "Aplicaciones y proyectos con control total",
                  "Cargas exigentes y servidores de juegos",
                ],
              },
            ]}
          />
        </div>
      </section>
    ) : null,
    featuredPlans: visibility.featuredPlans ? (
      <section className="section" key="featured">
        <div className="wrap">
          <SectionHead
            kicker={content.featuredKicker}
            title={<>{content.featuredTitle}</>}
            lead={content.featuredLead}
          />
          <div className="cards">
            {featured.length ? (
              featured.map((plan) => (
                <PlanCard key={plan.id} plan={plan} featured />
              ))
            ) : (
              <p className="muted">
                Marca planes como «Destacado» en el panel de catálogo para
                mostrarlos aquí.
              </p>
            )}
          </div>
        </div>
      </section>
    ) : null,
    locations: visibility.locations ? (
      <section className="section" key="locations">
        <div className="wrap">
          <SectionHead
            kicker="Ubicaciones"
            title={
              <>
                Cerca de tus usuarios,{" "}
                <span className="neon-text">en EE. UU.</span>
              </>
            }
            lead="Cuatro ubicaciones activas para tus VPS. Elige la más cercana para minimizar la latencia."
          />
          <div className="loc-show-grid">
            {enabledLocations.map((loc) => {
              const count = catalog.vps.filter(
                (p) => p.locationId === loc.id,
              ).length;
              return (
                <article key={loc.id} className="loc-show-card glass">
                  <span className="loc-flag">{loc.flag}</span>
                  <h3>{loc.city}</h3>
                  <p>
                    {loc.name} · {count} plan{count === 1 ? "" : "es"} VPS
                  </p>
                  {loc.badge ? <span className="pill">{loc.badge}</span> : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    ) : null,
    whyUs: visibility.whyUs ? (
      <section className="section" key="whyUs">
        <div className="wrap">
          <SectionHead
            kicker="¿Por qué CaluServers?"
            title={
              <>
                Diseñado para el rendimiento{" "}
                <span className="neon-text">y para ofrecer fiabilidad.</span>
              </>
            }
            lead="Infraestructura moderna con las herramientas y el soporte que necesitas para permanecer en línea."
          />
          <div className="cards">
            <div className="card glass">
              <div className="icon-chip">
                <img src={iconRed} alt="" />
              </div>
              <h3>Rendimiento NVMe</h3>
              <p>
                Tecnología de almacenamiento rápido diseñada para mantener la
                capacidad de respuesta de tus sitios web y aplicaciones.
              </p>
            </div>
            <div className="card glass">
              <div className="icon-chip">
                <img src={iconSeguridad} alt="" />
              </div>
              <h3>Seguridad primero</h3>
              <p>
                Diseño de plataforma orientado a la seguridad y opciones de
                protección configurables.
              </p>
            </div>
            <div className="card glass">
              <div className="icon-chip">
                <img src={iconSoporte} alt="" />
              </div>
              <h3>Soporte 24/7</h3>
              <p>
                Accede al servicio de atención al cliente y gestiona tus
                solicitudes a través de tu portal de cliente.
              </p>
            </div>
          </div>
        </div>
      </section>
    ) : null,
    faq: visibility.faq ? (
      <section className="section" key="faq">
        <div className="wrap">
          <SectionHead
            kicker="Preguntas frecuentes"
            title={
              <>
                Dudas comunes,{" "}
                <span className="neon-text">respuestas claras.</span>
              </>
            }
          />
          <Faq items={faq} />
        </div>
      </section>
    ) : null,
    cta: visibility.cta ? (
      <section className="section" key="cta">
        <div className="wrap">
          <div className="glass wide-cta">
            <div>
              <span className="kicker">{content.ctaKicker}</span>
              <h2>{content.ctaTitle}</h2>
              <p className="muted">{content.ctaLead}</p>
            </div>
            <SafeLink
              className="btn primary"
              href={content.ctaButtonHref}
              whmcs={whmcs}
            >
              {content.ctaButtonLabel}
            </SafeLink>
          </div>
        </div>
      </section>
    ) : null,
  };

  // trustStrip lives visually under hero historically; if ordered separately, render as section
  return (
    <>
      {sections.map((sec) => {
        if (!sec.enabled) return null;
        const node = blocks[sec.id];
        if (!node) return null;
        return (
          <div key={sec.id} className={`home-section home-section--${sec.id}`}>
            {node}
          </div>
        );
      })}
    </>
  );
}
