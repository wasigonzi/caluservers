import { Link } from "react-router-dom";
import iconVps from "../assets/icons/servicio-vps.svg";
import iconRed from "../assets/icons/servicio-red.svg";
import iconSeguridad from "../assets/icons/servicio-seguridad.svg";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, PlanCard, useDocumentTitle } from "../components/Layout";
import { Faq, SectionHead } from "../components/Sections";

const DEDICATED_FAQ = [
  {
    q: "¿Qué significa que el hardware sea dedicado?",
    a: "El servidor físico es solo tuyo: CPU, RAM y almacenamiento no se comparten con ningún otro cliente. Eliges entre Intel Xeon, AMD Ryzen o AMD EPYC según el plan.",
  },
  {
    q: "¿Puedo elegir el sistema operativo?",
    a: "Sí. La selección de sistema operativo es parte de la configuración de cada servidor dedicado.",
  },
  {
    q: "¿Cómo se gestiona el servidor?",
    a: "Cada plan incluye opciones de gestión remota y red configurable, además de opciones de protección DDoS. Puedes administrarlo tú o pedir una configuración a medida.",
  },
  {
    q: "¿Necesito una configuración que no está en la lista?",
    a: "Sí, es posible. Habla con el equipo desde la página de Contacto y se arma el servidor que tu proyecto necesita.",
  },
  {
    q: "¿Cuándo conviene un dedicado frente a un VPS?",
    a: "Cuando necesitas todo el hardware para ti solo, sin vecinos: cargas exigentes, servidores de juegos con muchos jugadores o proyectos que piden CPU, RAM y disco dedicados de forma constante.",
  },
];

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
        <section className="section">
          <SectionHead
            kicker="Casos de uso"
            title={
              <>
                Para proyectos que necesitan{" "}
                <span className="neon-text">hardware propio.</span>
              </>
            }
            lead="Cuando compartir recursos ya no alcanza, el servidor completo es tuyo: CPU, RAM y disco sin vecinos."
          />
          <div className="use-case-grid">
            <article className="use-case-card glass">
              <div className="icon-chip">
                <img src={iconVps} alt="" />
              </div>
              <h3>Servidores de juegos</h3>
              <p>
                Hardware dedicado para comunidades y servidores de juegos que
                necesitan baja latencia, CPU de alta frecuencia y recursos
                estables con muchos jugadores conectados.
              </p>
            </article>
            <article className="use-case-card glass">
              <div className="icon-chip">
                <img src={iconRed} alt="" />
              </div>
              <h3>Aplicaciones exigentes</h3>
              <p>
                Bases de datos, APIs y aplicaciones con carga constante que
                piden RAM y almacenamiento NVMe dedicados, con red
                configurable según el proyecto.
              </p>
            </article>
            <article className="use-case-card glass">
              <div className="icon-chip">
                <img src={iconSeguridad} alt="" />
              </div>
              <h3>Proyectos con control total</h3>
              <p>
                Elige tu sistema operativo, configura la red y la protección
                DDoS, y gestiona el servidor de forma remota. Nada compartido,
                nada que pedir prestado.
              </p>
            </article>
          </div>
        </section>
        <section className="section">
          <SectionHead
            kicker="Preguntas frecuentes"
            title={
              <>
                Dedicados,{" "}
                <span className="neon-text">sin letra pequeña.</span>
              </>
            }
          />
          <Faq items={DEDICATED_FAQ} />
        </section>
      </section>
    </>
  );
}
