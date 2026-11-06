"use client";

import { useEffect, useRef, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HERO_BG_DATA_URI } from "@/lib/brand";
import type { Plan } from "@/lib/catalog";
import { isPriceToConfirm } from "@/lib/catalog";
import type { SiteSettings } from "@/lib/site-settings";
import { applySiteTheme, socialEntries } from "@/lib/site-settings";
import { useRevealOnScroll } from "@/components/site/Interactive";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Inicio" },
  { href: "/web-hosting", label: "Alojamientos" },
  { href: "/vps", label: "VPS" },
  { href: "/dedicated", label: "Dedicados" },
  { href: "/domains", label: "Dominios" },
  { href: "/about", label: "Nosotros" },
];

type TabIconProps = SVGProps<SVGSVGElement>;

function IconHome(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M12 3.2 3.5 10.2a1 1 0 0 0-.3.7V20a1.2 1.2 0 0 0 1.2 1.2h5.1V15.5h4.9V21.2h5.1A1.2 1.2 0 0 0 20.8 20v-9.1a1 1 0 0 0-.3-.7L12 3.2Z" />
    </svg>
  );
}
function IconHosting(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v3A1.5 1.5 0 0 1 19 10.5H5A1.5 1.5 0 0 1 3.5 9V6A1.5 1.5 0 0 1 5 4.5Zm1.2 2.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13.5h14a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18v-3A1.5 1.5 0 0 1 5 13.5Zm1.2 2.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    </svg>
  );
}
function IconVps(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M7.2 4.2h9.6A3 3 0 0 1 19.8 7.2v9.6a3 3 0 0 1-3 3H7.2a3 3 0 0 1-3-3V7.2a3 3 0 0 1 3-3Zm1.1 3.1a1.1 1.1 0 1 0 0 2.2h7.4a1.1 1.1 0 1 0 0-2.2H8.3Zm0 4.3a1.1 1.1 0 1 0 0 2.2h4.6a1.1 1.1 0 1 0 0-2.2H8.3Zm0 4.3a1.1 1.1 0 1 0 0 2.2h2.4a1.1 1.1 0 1 0 0-2.2H8.3Z" />
    </svg>
  );
}
function IconDomains(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 1.8c-1.5 1.7-2.4 4.1-2.6 6.7h5.2c-.2-2.6-1.1-5-2.6-6.7Zm3.5.8c1.1 1.6 1.9 3.6 2.2 5.9h3c-.7-2.9-2.7-5.2-5.2-6.4ZM6.5 5.1C4 6.3 2 8.6 1.3 11.5h3c.3-2.3 1.1-4.3 2.2-5.9Zm-3.2 8.2C4 16.2 6 18.5 8.5 19.7c-1.1-1.6-1.9-3.6-2.2-5.9h-3Zm5.1 0c.2 2.6 1.1 5 2.6 6.7 1.5-1.7 2.4-4.1 2.6-6.7H8.4Zm7.1 0c-.3 2.3-1.1 4.3-2.2 5.9 2.5-1.2 4.5-3.5 5.2-6.4h-3Z" />
    </svg>
  );
}
function IconClient(props: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M12 3.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Zm0 10.2c3.9 0 7.3 2 7.3 4.5v.8A1.5 1.5 0 0 1 17.8 20.5H6.2A1.5 1.5 0 0 1 4.7 19v-.8c0-2.5 3.4-4.5 7.3-4.5Z" />
    </svg>
  );
}

const MOBILE_TABS: {
  key: string;
  label: string;
  href?: string;
  external?: boolean;
  Icon: (props: TabIconProps) => ReactNode;
}[] = [
  { key: "home", label: "Inicio", href: "/", Icon: IconHome },
  { key: "hosting", label: "Hosting", href: "/web-hosting", Icon: IconHosting },
  { key: "vps", label: "VPS", href: "/vps", Icon: IconVps },
  { key: "domains", label: "Dominios", href: "/domains", Icon: IconDomains },
  { key: "client", label: "Cliente", external: true, Icon: IconClient },
];

function TopBar({ settings }: { settings: SiteSettings }) {
  return (
    <div className="topbar">
      <div className="wrap topbar-in">
        <span>⚡ Infraestructura de alojamiento premium</span>
        <span>
          Estado de la red: <b className="ok">{settings.networkStatus}</b>
        </span>
      </div>
    </div>
  );
}

function Nav({ settings }: { settings: SiteSettings }) {
  const pathname = usePathname();
  return (
    <header className="nav glass">
      <div className="nav-in">
        <Link className="brand" href="/" aria-label="CaluServers - Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-principal.svg" alt="CALUSERVERS" />
        </Link>
        <details className="mobile-menu">
          <summary className="menu" aria-label="Abrir menú">☰</summary>
          <nav className="links open" aria-label="Principal">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
        <nav className="links desktop-links" aria-label="Principal">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="btn secondary" href={settings.whmcs}>
            Área de Cliente ↗
          </a>
          <Link className="btn primary" href="/domains">
            Comenzar
          </Link>
        </div>
      </div>
    </header>
  );
}

function MobileTabBar({ settings }: { settings: SiteSettings }) {
  const pathname = usePathname();
  const whmcs = settings.whmcs;
  return (
    <nav className="mobile-tabbar" aria-label="Navegación móvil">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.Icon;
        if (tab.external) {
          return (
            <a key={tab.key} className="mobile-tab" href={whmcs} target="_blank" rel="noreferrer">
              <span className="mobile-tab-icon"><Icon /></span>
              <span className="mobile-tab-label">{tab.label}</span>
            </a>
          );
        }
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href!);
        return (
          <Link key={tab.key} href={tab.href!} className={`mobile-tab${active ? " active" : ""}`}>
            <span className="mobile-tab-icon"><Icon /></span>
            <span className="mobile-tab-label">{tab.label}</span>
            {active ? <span className="sr-only">(página actual)</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer({ settings }: { settings: SiteSettings }) {
  const whmcs = settings.whmcs;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo-principal.svg" alt="CALUSERVERS" />
            <p>{settings.content.footerBlurb}</p>
            {settings.contact.email ? (
              <p><a href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a></p>
            ) : null}
            {settings.contact.phone ? (
              <p>
                <a href={`tel:${settings.contact.phone.replace(/\s/g, "")}`}>
                  {settings.contact.phone}
                </a>
              </p>
            ) : null}
            {settings.contact.hours ? <p className="muted">{settings.contact.hours}</p> : null}
            {socialEntries(settings.social).length > 0 ? (
              <div className="footer-social">
                {socialEntries(settings.social).map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <h4>Servicios</h4>
            <Link href="/web-hosting">Alojamiento</Link>
            <Link href="/vps">VPS</Link>
            <Link href="/dedicated">Servidores Dedicados</Link>
            <Link href="/domains">Registro de dominios</Link>
          </div>
          <div>
            <h4>Empresa</h4>
            <Link href="/about">Nosotros</Link>
            <Link href="/contact">Contacto</Link>
            <Link href="/terms">Términos y condiciones</Link>
            <Link href="/privacy">Política de Privacidad</Link>
          </div>
          <div>
            <h4>Explorar</h4>
            <a href={whmcs}>Área de Cliente</a>
            <a href={`${whmcs}/submitticket.php`}>Soporte</a>
            <Link href="/aup">Política de uso</Link>
            <Link href="/abuse">Abuso</Link>
          </div>
        </div>
        <div className="copyright">
          <span>© {new Date().getFullYear()} CALUSERVERS. Todos los derechos reservados.</span>
          <span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/monograma-cs.svg" alt="" style={{ height: 22, width: "auto", verticalAlign: "middle", marginRight: 8 }} />
            Hosting • VPS • Dedicated Servers
          </span>
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({
  settings,
  children,
}: {
  settings: SiteSettings;
  children: ReactNode;
}) {
  const mainRef = useRef<HTMLElement>(null);
  useRevealOnScroll(mainRef);
  useEffect(() => {
    applySiteTheme(settings);
  }, [settings]);

  return (
    <div className="site-shell has-mobile-tabbar">
      <div
        className="aurora"
        aria-hidden="true"
        style={{ backgroundImage: `url(${HERO_BG_DATA_URI})` }}
      />
      <TopBar settings={settings} />
      <Nav settings={settings} />
      <main className="site-main" ref={mainRef}>
        {children}
      </main>
      <Footer settings={settings} />
      <MobileTabBar settings={settings} />
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
        {toConfirm ? <span className="price-consultar">Consultar</span> : plan.price}
        <span> / mes</span>
        {toConfirm ? <em className="price-note">Precio a confirmar en el portal</em> : null}
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
      <a className="btn primary" href={plan.purchaseUrl} target="_blank" rel="noreferrer">
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
