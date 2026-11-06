"use client";
import Link from "next/link";
const iconVps = "/icons/servicio-vps.svg";
const iconRed = "/icons/servicio-red.svg";
const iconSeguridad = "/icons/servicio-seguridad.svg";
import { useCatalog } from "@/lib/catalog-context";
import { PageHero, PlanCard } from "@/components/site/SiteShell";
import { Faq, SectionHead } from "@/components/site/Sections";
import { useCopy, usePageCopy } from "@/lib/page-content-context";
import { pc } from "@/lib/page-content";

export default function Dedicated() {
  const { catalog } = useCatalog();
  const plans = catalog.dedicated.filter((p) => p.active);
  const kicker = useCopy("kicker", "Dedicated Servers");
  const title = useCopy("title", "Bare-metal");
  const titleAccent = useCopy("titleAccent", "power.");
  const lead = useCopy(
    "lead",
    "Recursos dedicados y hardware configurable para cargas de trabajo exigentes.",
  );
  const popularTag = useCopy("popularTag", "Más popular");
  const defaultTag = useCopy("defaultTag", "CALUSERVERS");
  const customNotice = useCopy(
    "customNotice",
    "¿Necesitas una configuración a medida?",
  );
  const customCta = useCopy("customCta", "Habla con nuestro equipo");
  const customSuffix = useCopy(
    "customSuffix",
    "y armamos el servidor que tu proyecto necesita.",
  );
  const useKicker = useCopy("useKicker", "Casos de uso");
  const useTitle = useCopy("useTitle", "Para proyectos que necesitan");
  const useTitleAccent = useCopy("useTitleAccent", "hardware propio.");
  const useLead = useCopy(
    "useLead",
    "Cuando compartir recursos ya no alcanza, el servidor completo es tuyo: CPU, RAM y disco sin vecinos.",
  );
  const use1Title = useCopy("use1Title", "Servidores de juegos");
  const use1Text = useCopy(
    "use1Text",
    "Hardware dedicado para comunidades y servidores de juegos que necesitan baja latencia, CPU de alta frecuencia y recursos estables con muchos jugadores conectados.",
  );
  const use2Title = useCopy("use2Title", "Aplicaciones exigentes");
  const use2Text = useCopy(
    "use2Text",
    "Bases de datos, APIs y aplicaciones con carga constante que piden RAM y almacenamiento NVMe dedicados, con red configurable según el proyecto.",
  );
  const use3Title = useCopy("use3Title", "Proyectos con control total");
  const use3Text = useCopy(
    "use3Text",
    "Elige tu sistema operativo, configura la red y la protección DDoS, y gestiona el servidor de forma remota. Nada compartido, nada que pedir prestado.",
  );
  const useCases = [
    { icon: iconVps, title: use1Title, text: use1Text },
    { icon: iconRed, title: use2Title, text: use2Text },
    { icon: iconSeguridad, title: use3Title, text: use3Text },
  ];
  const faqKicker = useCopy("faqKicker", "Preguntas frecuentes");
  const faqTitle = useCopy("faqTitle", "Dedicados,");
  const faqTitleAccent = useCopy("faqTitleAccent", "sin letra pequeña.");
  const payload = usePageCopy();
  const faq = Array.from({ length: 5 }, (_, idx) => {
    const i = idx + 1;
    return {
      q: pc(payload, `faq${i}q`, ""),
      a: pc(payload, `faq${i}a`, ""),
    };
  }).filter((x) => x.q && x.a);

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
      <section className="wrap">
        <div className="plan-grid five">
          {plans.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={i === 1}
              tag={i === 1 ? popularTag : defaultTag}
            />
          ))}
        </div>
        <p className="notice glass" style={{ marginTop: 24 }}>
          {customNotice}{" "}
          <Link href="/contact">{customCta}</Link> {customSuffix}
        </p>
        <section className="section">
          <SectionHead
            kicker={useKicker}
            title={
              <>
                {useTitle}{" "}
                <span className="neon-text">{useTitleAccent}</span>
              </>
            }
            lead={useLead}
          />
          <div className="use-case-grid">
            {useCases.map((c) => (
              <article className="use-case-card glass" key={c.title}>
                <div className="icon-chip">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.icon} alt="" />
                </div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="section">
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
        </section>
      </section>
    </>
  );
}
