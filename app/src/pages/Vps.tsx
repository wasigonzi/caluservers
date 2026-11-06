import { useState } from "react";
import { RYZEN_DATA_URI } from "../lib/brand";
import { useCatalog } from "../lib/useCatalog";
import { PageHero, PlanCard, useDocumentTitle } from "../components/Layout";

export default function Vps() {
  useDocumentTitle("VPS Hosting");
  const { catalog } = useCatalog();
  const enabledLocations = catalog.locations.filter((l) => l.enabled);
  const [locationId, setLocationId] = useState("us-dallas");
  const [slide, setSlide] = useState(0);

  const selected =
    enabledLocations.find((l) => l.id === locationId) ?? enabledLocations[0];
  const plans = catalog.vps
    .filter((p) => p.locationId === (selected?.id ?? locationId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHero
        kicker="VPS Hosting"
        title={
          <>
            Tu servidor. <span className="neon-text">Tus reglas.</span>
          </>
        }
        lead="Despliega infraestructura de nueva generación en segundos. Cómputo Ryzen de alta frecuencia, recursos dedicados y uplinks de hasta 20 Gbps en ubicaciones de Europa y EE. UU."
      />
      <section className="wrap vps-location-section">
        <div className="section-head">
          <h2>
            Servidores virtuales{" "}
            <span className="neon-text">dedicados</span>
          </h2>
          <p>
            Selecciona una ubicación cercana a tus usuarios para minimizar la
            latencia.
          </p>
        </div>
        <div className="loc-heading">
          <b>Ubicaciones del datacenter</b>
          <span>Los tiempos de ping dependen de tu conexión.</span>
        </div>
        <div className="loc-grid">
          {enabledLocations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              className={`loc-card glass${loc.id === selected?.id ? " selected" : ""}`}
              aria-pressed={loc.id === selected?.id}
              onClick={() => setLocationId(loc.id)}
            >
              <span className="loc-flag">{loc.flag}</span>
              <span className="loc-details">
                <strong>{loc.name}</strong>
                <small>{loc.city}</small>
              </span>
              {loc.badge ? (
                <span className="loc-badge">{loc.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="section-head vps-plans-heading">
          <span className="kicker">Elige tu configuración</span>
          <h2>
            Planes <span className="neon-text">VPS Hosting</span>
          </h2>
          <p>
            Configuraciones disponibles en la ubicación seleccionada. Los
            precios varían por ubicación.
          </p>
        </div>
        {plans.length > 0 ? (
          <div className="plan-grid vps-grid">
            {plans.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                featured={i === 1}
                tag={i === 1 ? "Más popular" : "CALUSERVERS"}
              />
            ))}
          </div>
        ) : (
          <p className="notice glass">
            No hay planes disponibles en esta ubicación.
          </p>
        )}
      </section>

      <section className="section">
        <div className="wrap">
          <div className="vps-tabs" role="tablist">
            <button
              className={`vps-tab glass${slide === 0 ? " active" : ""}`}
              onClick={() => setSlide(0)}
            >
              01 · Rendimiento — Ryzen 9950X
            </button>
            <button
              className={`vps-tab glass${slide === 1 ? " active" : ""}`}
              onClick={() => setSlide(1)}
            >
              02 · Control — Root total
            </button>
            <button
              className={`vps-tab glass${slide === 2 ? " active" : ""}`}
              onClick={() => setSlide(2)}
            >
              03 · Red — 20 Gbps
            </button>
          </div>
          <div className="vps-panel">
            <article
              className={`vps-slide${slide === 0 ? " active" : ""}`}
            >
              <div className="vps-copy">
                <span className="vps-label">01 · Rendimiento</span>
                <h2>
                  Nueva generación <em>Ryzen 9950X</em>
                </h2>
                <p>
                  Nunca más compartas recursos. Nuestros servidores virtuales
                  dedicados garantizan recursos de CPU y RAM asignados, con
                  procesadores AMD Ryzen 9: el 9950X en la mayoría de
                  ubicaciones y el 7950X3D o el 9950X3D en Alemania.
                </p>
                <ul>
                  <li>Memoria DDR5 de alta frecuencia</li>
                  <li>Velocidades NVMe Gen 5</li>
                  <li>Aprovisionamiento instantáneo</li>
                </ul>
              </div>
              <img
                className="ryzen-img"
                src={RYZEN_DATA_URI}
                alt="Procesador AMD Ryzen de nueva generación"
              />
            </article>
            <article
              className={`vps-slide${slide === 1 ? " active" : ""}`}
            >
              <div className="vps-copy">
                <span className="vps-label">02 · Control</span>
                <h2>
                  Tu servidor. <em>Root total.</em>
                </h2>
                <p>
                  Control completo para instalar, configurar y administrar tu
                  entorno. Despliega aplicaciones, elige tu sistema operativo
                  y adapta los recursos a tu proyecto.
                </p>
                <ul>
                  <li>Acceso root / administrador</li>
                  <li>Distribuciones Linux disponibles</li>
                  <li>Reinstalación y gestión del servidor</li>
                </ul>
              </div>
              <div className="terminal glass">
                <div className="terminal-head">
                  <i></i>
                  <i></i>
                  <i></i>
                  <span>root@caluservers:~</span>
                </div>
                <div className="terminal-body">
                  <p>
                    <b>$</b> whoami
                  </p>
                  <strong>root</strong>
                  <p>
                    <b>$</b> systemctl status server
                  </p>
                  <span className="terminal-ok">● active (running)</span>
                  <p>
                    <b>$</b> apt update
                  </p>
                  <span className="terminal-muted">
                    Package lists updated...
                  </span>
                  <p className="cursor-line">_</p>
                </div>
              </div>
            </article>
            <article
              className={`vps-slide${slide === 2 ? " active" : ""}`}
            >
              <div className="vps-copy">
                <span className="vps-label">03 · Red</span>
                <h2>
                  Conexión de alto <em>rendimiento.</em>
                </h2>
                <p>
                  Una red diseñada para mantener tus servicios conectados.
                  Disfruta de capacidad de red de hasta 20 Gbps donde la
                  ubicación y el plan lo permitan.
                </p>
                <ul>
                  <li>Hasta 20 Gbps de capacidad de red*</li>
                  <li>Conectividad para aplicaciones exigentes</li>
                  <li>Opciones de protección DDoS según ubicación</li>
                </ul>
                <small className="fineprint">
                  *La velocidad máxima depende del plan, la ubicación y la
                  disponibilidad real de infraestructura.
                </small>
              </div>
              <div className="glass big-stat">
                <strong>20</strong>
                <span>Gbps</span>
                <small>High-speed network</small>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
