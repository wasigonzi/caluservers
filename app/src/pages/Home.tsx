import { Link } from "react-router-dom";
import SplineHero from "../components/SplineHero";
import iconHosting from "../assets/icons/servicio-hosting.svg";
import iconVps from "../assets/icons/servicio-vps.svg";
import iconDedicados from "../assets/icons/servicio-dedicados.svg";
import iconRed from "../assets/icons/servicio-red.svg";
import iconSeguridad from "../assets/icons/servicio-seguridad.svg";
import iconSoporte from "../assets/icons/servicio-soporte.svg";
import { isPriceToConfirm } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { useDocumentTitle } from "../components/Layout";
import { AnimatedNumber } from "../components/Interactive";
import {
  CompareTable,
  Faq,
  SectionHead,
  Steps,
  TrustStrip,
} from "../components/Sections";

/** Precio mínimo real de una categoría (ignora "$0.00" = precio a confirmar). */
function minPrice(prices: string[]): string {
  const valid = prices
    .filter((p) => !isPriceToConfirm(p))
    .map((p) => parseFloat(p.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n));
  return valid.length > 0 ? `$${Math.min(...valid).toFixed(2)}` : "Consultar";
}

const HOME_FAQ = [
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
  useDocumentTitle("Web Hosting • VPS • Game • Dedicated Servers");
  const { catalog } = useCatalog();
  const enabledLocations = catalog.locations.filter((l) => l.enabled);
  const webMin = minPrice(catalog.webHosting.map((p) => p.price));
  const vpsMin = minPrice(catalog.vps.map((p) => p.price));
  const dedMin = minPrice(catalog.dedicated.map((p) => p.price));

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow">
              <i className="dot"></i> Alojamiento de próxima generación
            </span>
            <h1>
              Impulsando tu <span className="neon-text">mundo digital.</span>
            </h1>
            <p className="lead">
              Almacenamiento SSD puro, LiteSpeed con LSCache, todo desde
              cPanel. Incluye SSL gratis, migración gratis desde cualquier
              proveedor y copias diarias.
            </p>
            <div className="hero-pills">
              <span className="pill">Desde 2013</span>
              <span className="pill">4 ubicaciones en EE. UU.</span>
              <span className="pill">Ryzen 9 9950X</span>
            </div>
            <div className="hero-ctas">
              <Link className="btn primary" to="/web-hosting">
                Ver Hosting →
              </Link>
              <Link className="btn ghost" to="/vps">
                Ver VPS
              </Link>
            </div>
            <div className="stats">
              <div className="stat glass">
                <strong>24/7</strong>
                <span>Apoyo técnico</span>
              </div>
              <div className="stat glass">
                <strong>
                  <AnimatedNumber value={99.9} decimals={1} suffix="%" />
                </strong>
                <span>Uptime</span>
              </div>
              <div className="stat glass">
                <strong>NVMe</strong>
                <span>Almacenamiento rápido</span>
              </div>
            </div>
          </div>
          <SplineHero />
        </div>
        <div className="wrap">
          <TrustStrip
            items={[
              "Desde 2013",
              "Soporte 24/7 por ticket en español e inglés",
              "4 ubicaciones en EE. UU.",
              "NVMe Gen 5",
              "Ryzen 9 9950X",
              "Protección DDoS",
            ]}
          />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker="Nuestros servicios"
            title={
              <>
                Infraestructura que{" "}
                <span className="neon-text">te impulsa hacia adelante.</span>
              </>
            }
            lead="Elige la plataforma adecuada para tu sitio web, aplicación o carga de trabajo empresarial."
          />
          <div className="cards">
            <article className="card glass">
              <div className="icon-chip">
                <img src={iconHosting} alt="" />
              </div>
              <h3>Web Hosting</h3>
              <p>
                Alojamiento rápido, seguro y sencillo para sitios personales,
                empresas y marcas en crecimiento. Desde {webMin}/mes.
              </p>
              <Link className="btn ghost" to="/web-hosting">
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
                servidores virtuales. Desde {vpsMin}/mes.
              </p>
              <Link className="btn ghost" to="/vps">
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
                cargas de trabajo exigentes. Desde {dedMin}/mes.
              </p>
              <Link className="btn ghost" to="/dedicated">
                Ver planes →
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker="Cómo funciona"
            title={
              <>
                De la idea al servidor en{" "}
                <span className="neon-text">tres pasos.</span>
              </>
            }
            lead="Sin procesos complicados: eliges, compras en el portal seguro y lo gestionas desde tu panel de cliente."
          />
          <Steps
            steps={[
              {
                title: "Elige tu plan",
                text: "Compara Web Hosting, VPS y Dedicados y escoge la configuración que se ajuste a tu proyecto y tu presupuesto.",
              },
              {
                title: "Compra segura en WHMCS",
                text: "El pedido se completa en el portal de cliente de CaluServers, donde también gestionas facturación y renovaciones.",
              },
              {
                title: "Gestiónalo desde tu panel",
                text: "Accede a cPanel, a tu VPS con root total o a tu servidor dedicado, y abre tickets de soporte 24/7 cuando lo necesites.",
              },
            ]}
          />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker="Comparativa"
            title={
              <>
                ¿Web Hosting, VPS o{" "}
                <span className="neon-text">Dedicado?</span>
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
                  <span className="best" key="w">{webMin}/mes</span>,
                  <span className="best" key="v">{vpsMin}/mes</span>,
                  <span className="best" key="d">{dedMin}/mes</span>,
                ],
              },
              {
                label: "Procesador",
                cells: [
                  "Compartido",
                  "AMD Ryzen 9 9950X · 1–16 vCores",
                  "Intel Xeon · AMD Ryzen · AMD EPYC · 8–24 cores",
                ],
              },
              {
                label: "Memoria",
                cells: ["—", "2–64 GB DDR5", "32–256 GB RAM"],
              },
              {
                label: "Almacenamiento",
                cells: [
                  "20–100 GB NVMe SSD",
                  "20–960 GB SSD NVMe Gen 5",
                  "2× 1 TB SSD – 4× 2 TB NVMe",
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
          <p className="fineprint" style={{ textAlign: "center" }}>
            Rangos tomados de los planes publicados: VPS de 1 vCore/2 GB a 16
            vCores/64 GB; dedicados de 8 cores/32 GB a 24 cores/256 GB.
          </p>
        </div>
      </section>

      <section className="section">
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
                    disponible{count === 1 ? "" : "s"}
                  </p>
                  {loc.badge ? (
                    <span className="pill">{loc.badge}</span>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
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

      <section className="section">
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
          <Faq items={HOME_FAQ} />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="glass wide-cta">
            <div>
              <span className="kicker">¿Estás listo?</span>
              <h2>Tu próximo proyecto comienza aquí.</h2>
              <p className="muted">
                Encuentra un plan de alojamiento que se ajuste a tus objetivos.
              </p>
            </div>
            <Link className="btn primary" to="/web-hosting">
              Comenzar →
            </Link>
          </div>
          <p className="fineprint">
            *El tiempo de actividad es solo un objetivo, no una garantía
            contractual. Publica un SLA (acuerdo de nivel de servicio)
            únicamente después de haber confirmado tus compromisos de
            infraestructura.
          </p>
        </div>
      </section>
    </>
  );
}
