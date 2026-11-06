import { useEffect, useRef, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
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

type TabIconProps = SVGProps<SVGSVGElement>;

function IconHome(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 3.2 3.5 10.2a1 1 0 0 0-.3.7V20a1.2 1.2 0 0 0 1.2 1.2h5.1V15.5h4.9V21.2h5.1A1.2 1.2 0 0 0 20.8 20v-9.1a1 1 0 0 0-.3-.7L12 3.2Z"
      />
    </svg>
  );
}

function IconHosting(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v3A1.5 1.5 0 0 1 19 10.5H5A1.5 1.5 0 0 1 3.5 9V6A1.5 1.5 0 0 1 5 4.5Zm1.2 2.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13.5h14a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18v-3A1.5 1.5 0 0 1 5 13.5Zm1.2 2.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
    </svg>
  );
}

function IconVps(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M7.2 4.2h9.6A3 3 0 0 1 19.8 7.2v9.6a3 3 0 0 1-3 3H7.2a3 3 0 0 1-3-3V7.2a3 3 0 0 1 3-3Zm1.1 3.1a1.1 1.1 0 1 0 0 2.2h7.4a1.1 1.1 0 1 0 0-2.2H8.3Zm0 4.3a1.1 1.1 0 1 0 0 2.2h4.6a1.1 1.1 0 1 0 0-2.2H8.3Zm0 4.3a1.1 1.1 0 1 0 0 2.2h2.4a1.1 1.1 0 1 0 0-2.2H8.3Z"
      />
    </svg>
  );
}

function IconDomains(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 1.8c-1.5 1.7-2.4 4.1-2.6 6.7h5.2c-.2-2.6-1.1-5-2.6-6.7Zm3.5.8c1.1 1.6 1.9 3.6 2.2 5.9h3c-.7-2.9-2.7-5.2-5.2-6.4ZM6.5 5.1C4 6.3 2 8.6 1.3 11.5h3c.3-2.3 1.1-4.3 2.2-5.9Zm-3.2 8.2C4 16.2 6 18.5 8.5 19.7c-1.1-1.6-1.9-3.6-2.2-5.9h-3Zm5.1 0c.2 2.6 1.1 5 2.6 6.7 1.5-1.7 2.4-4.1 2.6-6.7H8.4Zm7.1 0c-.3 2.3-1.1 4.3-2.2 5.9 2.5-1.2 4.5-3.5 5.2-6.4h-3Z"
      />
    </svg>
  );
}

function IconClient(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 3.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Zm0 10.2c3.9 0 7.3 2 7.3 4.5v.8A1.5 1.5 0 0 1 17.8 20.5H6.2A1.5 1.5 0 0 1 4.7 19v-.8c0-2.5 3.4-4.5 7.3-4.5Z"
      />
    </svg>
  );
}

const MOBILE_TABS: {
  key: string;
  label: string;
  to?: string;
  external?: boolean;
  Icon: (props: TabIconProps) => ReactNode;
}[] = [
  { key: "home", label: "Inicio", to: "/", Icon: IconHome },
  { key: "hosting", label: "Hosting", to: "/web-hosting", Icon: IconHosting },
  { key: "vps", label: "VPS", to: "/vps", Icon: IconVps },
  { key: "domains", label: "Dominios", to: "/domains", Icon: IconDomains },
  { key: "client", label: "Cliente", external: true, Icon: IconClient },
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
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
        <nav className={`links${open ? " open" : ""}`} aria-label="Principal">
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

/** Navegación inferior estilo app: solo pantallas pequeñas vía CSS. */
export function MobileTabBar() {
  const { catalog } = useCatalog();
  const whmcs = catalog.settings.whmcs;
  return (
    <nav className="mobile-tabbar" aria-label="Navegación móvil">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.Icon;
        if (tab.external) {
          return (
            <a
              key={tab.key}
              className="mobile-tab"
              href={whmcs}
              target="_blank"
              rel="noreferrer"
            >
              <span className="mobile-tab-icon">
                <Icon />
              </span>
              <span className="mobile-tab-label">{tab.label}</span>
            </a>
          );
        }
        return (
          <NavLink
            key={tab.key}
            to={tab.to!}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `mobile-tab${isActive ? " active" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="mobile-tab-icon">
                  <Icon />
                </span>
                <span className="mobile-tab-label">{tab.label}</span>
                {isActive ? (
                  <span className="sr-only">(página actual)</span>
                ) : null}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
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
              style={{
                height: 22,
                width: "auto",
                verticalAlign: "middle",
                marginRight: 8,
              }}
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
  const { pathname } = useLocation();
  useRevealOnScroll(mainRef);
  // Admin: sin tab bar para no interferir con login/formularios.
  const showMobileTabBar = !pathname.startsWith("/admin");
  return (
    <div
      className={`site-shell${showMobileTabBar ? " has-mobile-tabbar" : ""}`}
    >
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
      {showMobileTabBar ? <MobileTabBar /> : null}
    </div>
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
