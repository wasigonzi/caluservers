"use client";

import {
  LayoutDashboard,
  Palette,
  Brush,
  PenLine,
  LayoutList,
  Tags,
  SearchCheck,
  Navigation,
  FileText,
  Users,
  Server,
  ServerCog,
  Package,
  Inbox,
  Receipt,
  LifeBuoy,
  History,
  Boxes,
  Settings,
  SlidersHorizontal,
  ExternalLink,
  Menu,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type NavBadges = Partial<Record<"facturas" | "servicios" | "tickets" | "mensajes", number>>;
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: keyof NavBadges;
  /** Sección del estudio del sitio (`/admin/site?seccion=`). */
  section?: string;
};
type NavGroup = { title: string; items: NavItem[] };

const site = (label: string, section: string, icon: LucideIcon): NavItem => ({
  label,
  icon,
  section,
  href: section === "branding" ? "/admin/site" : `/admin/site?seccion=${section}`,
});

const GROUPS: NavGroup[] = [
  {
    title: "Resumen",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Actividad", href: "/admin/actividad", icon: History },
    ],
  },
  {
    title: "Negocio",
    items: [
      { label: "Clientes", href: "/admin/clientes", icon: Users },
      { label: "Pedidos y facturas", href: "/admin/facturas", icon: Receipt, badge: "facturas" },
      { label: "Servicios", href: "/admin/servicios", icon: Boxes, badge: "servicios" },
      { label: "Tickets", href: "/admin/tickets", icon: LifeBuoy, badge: "tickets" },
      { label: "Mensajes", href: "/admin/mensajes", icon: Inbox, badge: "mensajes" },
    ],
  },
  {
    title: "Sitio web",
    items: [
      site("Branding", "branding", Palette),
      site("Apariencia", "appearance", Brush),
      site("Contenido y contacto", "content", PenLine),
      site("Secciones del inicio", "sections", LayoutList),
      site("Catálogo y precios", "catalog", Tags),
      site("SEO", "seo", SearchCheck),
      site("Navegación", "nav", Navigation),
      { label: "Textos de páginas", href: "/admin/pages", icon: FileText },
    ],
  },
  {
    title: "Servidor WHM",
    items: [
      { label: "Cuentas cPanel", href: "/admin/accounts", icon: Server },
      { label: "Paquetes", href: "/admin/packages", icon: Package },
      { label: "Conexión WHM", href: "/admin/settings", icon: Settings },
      { label: "Alta automática", href: "/admin/provision", icon: ServerCog },
    ],
  },
  {
    title: "Configuración",
    items: [{ label: "General", href: "/admin/configuracion", icon: SlidersHorizontal }],
  },
];

function isActive(pathname: string, section: string, item: NavItem) {
  if (item.section) return pathname === "/admin/site" && section === item.section;
  if (item.href === "/admin") return pathname === "/admin";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function AdminShell({
  children,
  email,
  badges = {},
}: {
  children: React.ReactNode;
  email?: string;
  /** Pendientes por sección. Se omiten si la base no respondió. */
  badges?: NavBadges;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // La vista previa es parte del estudio, no una sección del menú: resalta Branding.
  const requested = params.get("seccion") || "branding";
  const section = requested === "preview" ? "branding" : requested;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname, section]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      asideRef.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled])",
      );
    focusable()?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  const crumb =
    GROUPS.flatMap((g) => g.items).find((i) => isActive(pathname, section, i))
      ?.label || "Admin";

  const nav = (
    <>
      <Link
        className="admin-brand"
        href="/admin"
        onClick={() => setOpen(false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/monograma-cs.svg" width="36" height="36" alt="" />
        <span>
        CALU<span className="accent">SERVERS</span>
        </span>
      </Link>
      <p className="admin-side-sub muted">Panel de administración</p>
      <nav className="admin-nav" aria-label="Admin">
        {GROUPS.map((group) => (
          <div className="admin-nav-group" key={group.title}>
            <p className="admin-nav-title">{group.title}</p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive(pathname, section, item)
                    ? "admin-nav-link active"
                    : "admin-nav-link"
                }
                aria-current={
                  isActive(pathname, section, item) ? "page" : undefined
                }
                onClick={() => setOpen(false)}
              >
                <item.icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge && badges[item.badge] ? (
                  <span className="nav-badge">
                    {badges[item.badge]}
                    <span className="sr-only"> pendientes</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-side-foot">
        {email ? <p className="muted admin-user">{email}</p> : null}
        <button
          className="btn secondary admin-logout"
          type="button"
          onClick={() => {
            void fetch("/api/admin/logout", { method: "POST" }).finally(() => {
              window.location.assign("/admin/login");
            });
          }}
        >
          <LogOut size={16} aria-hidden="true" /> Salir
        </button>
        <Link
          className="admin-view-site"
          href="/"
          target="_blank"
          rel="noreferrer"
        >
          Ver sitio <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </div>
    </>
  );

  return (
    <div className={`admin-app${open ? " drawer-open" : ""}`}>
      <a href="#admin-content" className="admin-skip-link">
        Ir al contenido
      </a>
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-expanded={open}
          aria-controls={titleId}
          onClick={() => setOpen((v) => !v)}
        >
          <Menu size={18} aria-hidden="true" /> Menú
        </button>
        <div className="admin-breadcrumb">
          <span className="muted">Admin</span>
          <span aria-hidden="true"> / </span>
          <strong>{crumb}</strong>
        </div>
      </header>
      <div
        className="admin-overlay"
        hidden={!open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        ref={asideRef}
        className="admin-sidebar"
        id={titleId}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
      >
        <button
          type="button"
          className="admin-drawer-close"
          onClick={() => setOpen(false)}
        >
          Cerrar menú ×
        </button>
        {nav}
      </aside>
      <main id="admin-content" tabIndex={-1} className="admin-main">
        {children}
      </main>
    </div>
  );
}
