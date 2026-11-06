import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import logoPrincipal from "../assets/logo-principal.svg";
import monogramaCs from "../assets/monograma-cs.svg";
import { HERO_BG_DATA_URI } from "../lib/brand";
import type { Plan } from "../lib/catalog";
import { isPriceToConfirm } from "../lib/catalog";
import { useCatalog } from "../lib/useCatalog";
import { useRevealOnScroll } from "./Interactive";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | CaluServers`;
  }, [title]);
}

const NAV_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Inicio" },
  { to: "/web-hosting", label: "Alojamientos" },
  { to: "/vps", label: "VPS" },
  { to: "/dedicated", label: "Dedicados" },
  { to: "/domains", label: "Dominios" },
  { to: "/about", label: "Nosotros" },
];

export function TopBar() {
  const { catalog } = useCatalog();
  return (
    <div className="topbar">
      <div className="wrap topbar-in">
        <span>⚡ Infraestructura de alojamiento premium</span>
        <span>
          Estado de la red:{" "}
          <b className="ok">{catalog.settings.networkStatus}</b>
        </span>
      </div>
    </div>
  );
}

export function Nav() {
  const { catalog } = useCatalog();
  const [open, setOpen] = useState(false);
  return (
    <header className="nav glass">
      <div className="nav-in">
        <Link className="brand" to="/" aria-label="CaluServers - Inicio">
          <img src={logoPrincipal} alt="CALUSERVERS" />
        </Link>
        <button
          className="menu"
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
        <nav className={`links${open ? " open" : ""}`}>
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="btn secondary" href={catalog.settings.whmcs}>
            Área de Cliente ↗
          </a>
          <Link className="btn primary" to="/domains">
            Comenzar
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { catalog } = useCatalog();
  const whmcs = catalog.settings.whmcs;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src={logoPrincipal} alt="CALUSERVERS" />
            <p>Soporte 24/7 por ticket, en inglés y español.</p>
          </div>
          <div>
            <h4>Servicios</h4>
            <Link to="/web-hosting">Alojamiento</Link>
            <Link to="/vps">VPS</Link>
            <Link to="/dedicated">Servidores Dedicados</Link>
            <Link to="/domains">Registro de dominios</Link>
          </div>
          <div>
            <h4>Empresa</h4>
            <Link to="/about">Nosotros</Link>
            <Link to="/contact">Contacto</Link>
            <Link to="/terms">Términos y condiciones</Link>
            <Link to="/privacy">Política de Privacidad</Link>
          </div>
          <div>
            <h4>Explorar</h4>
            <a href={whmcs}>Área de Cliente</a>
            <a href={`${whmcs}/submitticket.php`}>Soporte</a>
            <Link to="/aup">Política de uso</Link>
            <Link to="/abuse">Abuso</Link>
          </div>
        </div>
        <div className="copyright">
          <span>
            © {new Date().getFullYear()} CALUSERVERS. Todos los derechos
            reservados.
          </span>
          <span>
            <img
              src={monogramaCs}
              alt=""
              style={{ height: 22, width: "auto", verticalAlign: "middle", marginRight: 8 }}
            />
            Hosting • VPS • Dedicated Servers
          </span>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  useRevealOnScroll(mainRef);
  return (
    <>
      <div
        className="aurora"
        aria-hidden="true"
        style={{ backgroundImage: `url(${HERO_BG_DATA_URI})` }}
      />
      <TopBar />
      <Nav />
      <main className="site-main" ref={mainRef}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export function PageHero({
  kicker,
  title,
  lead,
}: {
  kicker: string;
  title: ReactNode;
  lead: string;
}) {
  return (
    <section className="page-hero wrap">
      <span className="kicker">{kicker}</span>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
    </section>
  );
}

export function PlanCard({
  plan,
  featured,
  tag,
  compareChecked,
  onCompareToggle,
}: {
  plan: Plan;
  featured?: boolean;
  tag?: string;
  /** Si se pasa, muestra el checkbox "Comparar" del plan. */
  compareChecked?: boolean;
  onCompareToggle?: (id: string) => void;
}) {
  const toConfirm = isPriceToConfirm(plan.price);
  return (
    <article className={`plan-card glass${featured ? " featured" : ""}`}>
      <span className="tag">{tag ?? "CALUSERVERS"}</span>
      <h3>{plan.name}</h3>
      {plan.description ? <p className="muted">{plan.description}</p> : null}
      <div className="price-line">
        {toConfirm ? (
          <span className="price-consultar">Consultar</span>
        ) : (
          plan.price
        )}
        <span> / mes</span>
        {toConfirm ? (
          <em className="price-note">Precio a confirmar en el portal</em>
        ) : null}
      </div>
      <ul className="features">
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {onCompareToggle ? (
        <label className="checkline compare-check">
          <input
            type="checkbox"
            checked={compareChecked ?? false}
            onChange={() => onCompareToggle(plan.id)}
          />
          Comparar
        </label>
      ) : null}
      <a
        className="btn primary"
        href={plan.purchaseUrl}
        target="_blank"
        rel="noreferrer"
      >
        Ordenar →
      </a>
    </article>
  );
}

export function openWhmcsTicket(
  whmcs: string,
  fields: { label: string; value: string }[],
) {
  const text = fields.map((f) => `${f.label}: ${f.value}`).join("\n");
  const url = `${whmcs}/submitticket.php?message=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}
