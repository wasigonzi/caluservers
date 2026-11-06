"use client";
import { useState } from "react";
import { RYZEN_DATA_URI } from "@/lib/brand";
const iconVps = "/icons/servicio-vps.svg";
const iconRed = "/icons/servicio-red.svg";
const iconSeguridad = "/icons/servicio-seguridad.svg";
import { isPriceToConfirm } from "@/lib/catalog";
import { parseVpsSpecs } from "@/lib/vps";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero, PlanCard } from "@/components/site/SiteShell";
import { AnimatedNumber } from "@/components/site/Interactive";
import { VpsConfigurator } from "@/components/site/VpsConfigurator";
import {
  CompareTable,
  Faq,
  SectionHead,
} from "@/components/site/Sections";
import { useCopy, usePageCopy } from "@/lib/page-content-context";
import { pc } from "@/lib/page-content";

const VPS_TIERS = [
  "Starter",
  "Lite",
  "Normal",
  "Advanced",
  "Deluxe",
  "Ultimate",
  "Mystic",
  "Phantom",
];

export default function Vps() {
  const { catalog } = useCatalog();

  const kicker = useCopy("kicker", "VPS Hosting");
  const title = useCopy("title", "Tu servidor.");
  const titleAccent = useCopy("titleAccent", "Tus reglas.");
  const lead = useCopy(
    "lead",
    "Despliega infraestructura de nueva generación en segundos. Cómputo Ryzen de alta frecuencia, recursos dedicados y uplinks de hasta 20 Gbps en ubicaciones de Europa y EE. UU.",
  );
  const locTitle = useCopy("locTitle", "Servidores virtuales");
  const locTitleAccent = useCopy("locTitleAccent", "dedicados");
  const locLead = useCopy(
    "locLead",
    "Selecciona una ubicación cercana a tus usuarios para minimizar la latencia.",
  );
  const locHeading = useCopy("locHeading", "Ubicaciones del datacenter");
  const locHint = useCopy(
    "locHint",
    "Los tiempos de ping dependen de tu conexión.",
  );
  const compareKicker = useCopy("compareKicker", "Comparativa por ubicación");
  const compareTitle = useCopy("compareTitle", "El mismo nivel,");
  const compareTitleAccent = useCopy("compareTitleAccent", "en cada ciudad.");
  const compareLead = useCopy(
    "compareLead",
    "Precios reales del catálogo por nivel y ubicación. Dallas tiene la gama completa; Los Angeles, New York y Miami, una selección.",
  );
  const compareFineprint = useCopy(
    "compareFineprint",
    "Precios por mes. «Consultar» indica que el precio de ese plan no está publicado y se confirma en el portal de cliente.",
  );
  const whyKicker = useCopy("whyKicker", "Por qué Ryzen 9 9950X");
  const whyTitle = useCopy("whyTitle", "Potencia de escritorio,");
  const whyTitleAccent = useCopy("whyTitleAccent", "en tu servidor.");
  const whyLead = useCopy(
    "whyLead",
    "Los VPS de CaluServers corren sobre procesadores AMD Ryzen 9 de alta frecuencia, con recursos dedicados que no se comparten.",
  );
  const detail1Title = useCopy("detail1Title", "Ryzen 9 9950X");
  const detail1Text = useCopy(
    "detail1Text",
    "Alta frecuencia por núcleo para aplicaciones, juegos y cargas que dependen de un solo hilo. Recursos de CPU y RAM asignados, nunca compartidos.",
  );
  const detail2Title = useCopy("detail2Title", "DDR5 5600 MHz y NVMe Gen 5");
  const detail2Text = useCopy(
    "detail2Text",
    "Memoria DDR5 de alta frecuencia y almacenamiento SSD NVMe Gen 5 en todos los planes, desde 20 GB hasta 960 GB según el nivel.",
  );
  const detail3Title = useCopy("detail3Title", "Red de hasta 20 Gbps");
  const detail3Text = useCopy(
    "detail3Text",
    "Uplinks compartidos de 1 a 10 Gbps según el plan y la ubicación, con capacidad de red de hasta 20 Gbps donde la infraestructura lo permite.",
  );
  const detail4Title = useCopy("detail4Title", "IPv4 + IPv6 incluidos");
  const detail4Text = useCopy(
    "detail4Text",
    "La dirección IPv4 está incluida en el precio, y en la mayoría de ubicaciones también IPv6, sin costo adicional.",
  );
  const details = [
    { icon: iconVps, title: detail1Title, text: detail1Text },
    { icon: iconRed, title: detail2Title, text: detail2Text },
    { icon: iconSeguridad, title: detail3Title, text: detail3Text },
    { icon: iconVps, title: detail4Title, text: detail4Text },
  ];
  const faqKicker = useCopy("faqKicker", "Preguntas frecuentes");
  const faqTitle = useCopy("faqTitle", "VPS,");
  const faqTitleAccent = useCopy("faqTitleAccent", "sin letra pequeña.");
  const payload = usePageCopy();
  const faq = Array.from({ length: 6 }, (_, idx) => {
    const i = idx + 1;
    return {
      q: pc(payload, `faq${i}q`, ""),
      a: pc(payload, `faq${i}a`, ""),
    };
  }).filter((x) => x.q && x.a);

  const enabledLocations = catalog.locations.filter((l) => l.enabled);
  const [locationId, setLocationId] = useState("us-dallas");
  const [slide, setSlide] = useState(0);

  const selected =
    enabledLocations.find((l) => l.id === locationId) ?? enabledLocations[0];
  const plans = catalog.vps
    .filter((p) => p.active)
    .filter((p) => p.locationId === (selected?.id ?? locationId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Comparador: máximo 3 planes de la ubicación actual.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const comparePlans = compareIds
    .map((id) => plans.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  function changeLocation(id: string) {
    setLocationId(id);
    setCompareIds([]);
    setCompareOpen(false);
  }

  function toggleCompare(id: string) {
    const adding = !compareIds.includes(id);
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    if (adding) setCompareOpen(true);
  }

  return (
    <>
      <PageHero
        kicker={kicker}
        title={
          <>
            {title} <span className="neon-text">{titleAccent}</span>
          </>
        }
        lead={lead}
      />
      <section className="wrap vps-location-section">
        <div className="section-head">
          <h2>
            {locTitle}{" "}
            <span className="neon-text">{locTitleAccent}</span>
          </h2>
          <p>{locLead}</p>
        </div>
        <div className="loc-heading">
          <b>{locHeading}</b>
          <span>{locHint}</span>
        </div>
        <div className="loc-grid">
          {enabledLocations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              className={`loc-card glass${loc.id === selected?.id ? " selected" : ""}`}
              aria-pressed={loc.id === selected?.id}
              onClick={() => changeLocation(loc.id)}
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
          <span className="kicker">Arma tu VPS</span>
          <h2>
            Configura <span className="neon-text">a tu medida</span>
          </h2>
          <p>
            Elige la ubicación y los recursos que necesitas: te recomendamos
            el plan real que cubre esa configuración.
          </p>
        </div>
        <VpsConfigurator
          locations={enabledLocations}
          locationId={selected?.id ?? locationId}
          onLocationChange={changeLocation}
          plans={catalog.vps}
        />
      </section>

      <section className="wrap">
        <div className="section-head vps-plans-heading">
          <span className="kicker">Elige tu configuración</span>
          <h2>
            Planes <span className="neon-text">VPS Hosting</span>
          </h2>
          <p>
            Configuraciones disponibles en la ubicación seleccionada. Los
            precios varían por ubicación. Marca hasta 3 planes para
            compararlos.
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
                compareChecked={compareIds.includes(plan.id)}
                onCompareToggle={toggleCompare}
              />
            ))}
          </div>
        ) : (
          <p className="notice glass">
            No hay planes disponibles en esta ubicación.
          </p>
        )}
      </section>

      {comparePlans.length > 0 ? (
        <div className="compare-bar glass" role="region" aria-label="Comparativa de planes">
          <div className="compare-bar-info">
            <strong>
              Comparando {comparePlans.length} de 3:{" "}
              {comparePlans.map((p) => p.name).join(" · ")}
            </strong>
            <span className="muted">
              {selected?.city} · marca hasta 3 planes
            </span>
          </div>
          <div className="compare-bar-actions">
            <button
              type="button"
              className="btn primary small"
              aria-expanded={compareOpen}
              onClick={() => setCompareOpen((v) => !v)}
            >
              {compareOpen ? "Ocultar comparativa" : "Ver comparativa"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setCompareIds([]);
                setCompareOpen(false);
              }}
            >
              Limpiar
            </button>
          </div>
          {compareOpen ? (
            <div className="compare-panel">
              <CompareTable
                headers={["", ...comparePlans.map((p) => p.name)]}
                rows={[
                  {
                    label: "Precio",
                    cells: comparePlans.map((p) =>
                      isPriceToConfirm(p.price) ? "Consultar" : `${p.price}/mes`,
                    ),
                  },
                  {
                    label: "vCores",
                    cells: comparePlans.map((p) => {
                      const s = parseVpsSpecs(p);
                      return s.vCores !== null ? `${s.vCores} vCores` : "—";
                    }),
                  },
                  {
                    label: "Memoria RAM",
                    cells: comparePlans.map((p) => {
                      const s = parseVpsSpecs(p);
                      return s.ramGb !== null ? `${s.ramGb} GB DDR5` : "—";
                    }),
                  },
                  {
                    label: "Almacenamiento",
                    cells: comparePlans.map((p) => {
                      const s = parseVpsSpecs(p);
                      return s.storageGb !== null
                        ? `${s.storageGb} GB NVMe Gen 5`
                        : "—";
                    }),
                  },
                  {
                    label: "Uplink",
                    cells: comparePlans.map((p) => parseVpsSpecs(p).uplink ?? "—"),
                  },
                  {
                    label: "IP incluida",
                    cells: comparePlans.map((p) => parseVpsSpecs(p).ip ?? "—"),
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

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
                <strong>
                  <AnimatedNumber value={20} />
                </strong>
                <span>Gbps</span>
                <small>High-speed network</small>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker={compareKicker}
            title={
              <>
                {compareTitle}{" "}
                <span className="neon-text">{compareTitleAccent}</span>
              </>
            }
            lead={compareLead}
          />
          <CompareTable
            headers={["Nivel", "Dallas", "Los Angeles", "New York", "Miami"]}
            rows={VPS_TIERS.map((tier) => ({
              label: tier,
              cells: ["us-dallas", "us-la", "us-ny", "us-miami"].map(
                (locId) => {
                  const plan = catalog.vps.find(
                    (p) => p.locationId === locId && p.name === tier,
                  );
                  if (!plan) return "—";
                  if (isPriceToConfirm(plan.price)) return "Consultar";
                  return plan.price;
                },
              ),
            }))}
          />
          <p className="fineprint" style={{ textAlign: "center" }}>
            {compareFineprint}
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker={whyKicker}
            title={
              <>
                {whyTitle}{" "}
                <span className="neon-text">{whyTitleAccent}</span>
              </>
            }
            lead={whyLead}
          />
          <div className="detail-grid">
            {details.map((d) => (
              <article className="detail-card glass" key={d.title}>
                <div className="icon-chip">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.icon} alt="" />
                </div>
                <div>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <SectionHead
            kicker={faqKicker}
            title={
              <>
                {faqTitle}{" "}
                <span className="neon-text">{faqTitleAccent}</span>
              </>
            }
          />
          <Faq items={faq} />
        </div>
      </section>
    </>
  );
}
