import { Link } from "react-router-dom";
import { LOGO_DATA_URI } from "../lib/brand";
import { useDocumentTitle } from "../components/Layout";

export default function Home() {
  useDocumentTitle("Web Hosting • VPS • Game • Dedicated Servers");
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
                <strong>99.9%</strong>
                <span>Uptime</span>
              </div>
              <div className="stat glass">
                <strong>NVMe</strong>
                <span>Almacenamiento rápido</span>
              </div>
            </div>
          </div>
          <div className="glass show">
            <img src={LOGO_DATA_URI} alt="CALUSERVERS" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="kicker">Nuestros servicios</span>
            <h2>
              Infraestructura que{" "}
              <span className="neon-text">te impulsa hacia adelante.</span>
            </h2>
            <p>
              Elige la plataforma adecuada para tu sitio web, aplicación o
              carga de trabajo empresarial.
            </p>
          </div>
          <div className="cards">
            <article className="card glass">
              <div className="card-icon">▣</div>
              <h3>Web Hosting</h3>
              <p>
                Alojamiento rápido, seguro y sencillo para sitios personales,
                empresas y marcas en crecimiento.
              </p>
              <Link className="btn ghost" to="/web-hosting">
                Ver planes →
              </Link>
            </article>
            <article className="card glass">
              <div className="card-icon">⌘</div>
              <h3>VPS Hosting</h3>
              <p>
                Recursos dedicados, acceso root y configuraciones flexibles de
                servidores virtuales.
              </p>
              <Link className="btn ghost" to="/vps">
                Ver planes →
              </Link>
            </article>
            <article className="card glass">
              <div className="card-icon">▤</div>
              <h3>Dedicated Servers</h3>
              <p>
                Potente rendimiento en hardware dedicado para aplicaciones y
                cargas de trabajo exigentes.
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
          <div className="section-head">
            <span className="kicker">¿Por qué CaluServers?</span>
            <h2>
              Diseñado para el rendimiento{" "}
              <span className="neon-text">y para ofrecer fiabilidad.</span>
            </h2>
            <p>
              Infraestructura moderna con las herramientas y el soporte que
              necesitas para permanecer en línea.
            </p>
          </div>
          <div className="cards">
            <div className="card glass">
              <div className="card-icon">⚡</div>
              <h3>Rendimiento NVMe</h3>
              <p>
                Tecnología de almacenamiento rápido diseñada para mantener la
                capacidad de respuesta de tus sitios web y aplicaciones.
              </p>
            </div>
            <div className="card glass">
              <div className="card-icon">◈</div>
              <h3>Seguridad primero</h3>
              <p>
                Diseño de plataforma orientado a la seguridad y opciones de
                protección configurables.
              </p>
            </div>
            <div className="card glass">
              <div className="card-icon">◷</div>
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
