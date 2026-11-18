"use client";

import {
  LayoutDashboard,
  Palette,
  Brush,
  PenLine,
  BookOpen,
  LayoutList,
  Tags,
  SearchCheck,
  Navigation,
  FileText,
  Users,
  Globe,
  Server,
  ServerCog,
  Package,
  Inbox,
  Mail,
  MessagesSquare,
  Receipt,
  ShieldAlert,
  ChartColumn,
  LifeBuoy,
  History,
  ScrollText,
  Bell,
  Boxes,
  Settings,
  Plug,
  SlidersHorizontal,
  UserCog,
  ExternalLink,
  Menu,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type NavBadges = Partial<
  Record<"facturas" | "servicios" | "tickets" | "mensajes" | "alertas", number>
>;
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: keyof NavBadges;
  /** Sección del estudio del sitio (`/admin/site?seccion=`). */
  section?: string;
  /**
   * Permiso que exige la sección (Fase 1, tramo D — RBAC). Sin permiso, el
   * enlace se oculta y la página rechaza además por su cuenta. Sin este
   * campo, la sección la ve cualquier admin (p. ej. el Dashboard).
   */
  permission?: string;
};
type NavGroup = { title: string; items: NavItem[] };

const site = (label: string, section: string, icon: LucideIcon, permission: string): NavItem => ({
  label,
  icon,
  section,
  permission,
  href: section === "branding" ? "/admin/site" : `/admin/site?seccion=${section}`,
});

const GROUPS: NavGroup[] = [
  {
    title: "Resumen",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Actividad", href: "/admin/actividad", icon: History, permission: "audit:view" },
      // Auditoría unificada y alertas (Fase 6, frente B): mismo permiso
      // que Actividad. El contador de alertas sin leer se lee en el
      // cliente (ver `unreadAlerts` abajo) y solo se muestra con ese permiso.
      { label: "Auditoría", href: "/admin/auditoria", icon: ScrollText, permission: "audit:view" },
      { label: "Alertas", href: "/admin/alertas", icon: Bell, badge: "alertas", permission: "audit:view" },
    ],
  },
  {
    title: "Negocio",
    items: [
      { label: "Clientes", href: "/admin/clientes", icon: Users, permission: "clients:view" },
      { label: "Pedidos y facturas", href: "/admin/facturas", icon: Receipt, badge: "facturas", permission: "orders:view" },
      { label: "Servicios", href: "/admin/servicios", icon: Boxes, badge: "servicios", permission: "services:view" },
      { label: "Dominios", href: "/admin/dominios", icon: Globe, permission: "domains:view" },
      { label: "Tickets", href: "/admin/tickets", icon: LifeBuoy, badge: "tickets", permission: "tickets:view" },
      { label: "Fraude", href: "/admin/fraude", icon: ShieldAlert, permission: "orders:view" },
      { label: "Informes", href: "/admin/informes", icon: ChartColumn, permission: "reports:view" },
      { label: "Respuestas predefinidas", href: "/admin/respuestas-predefinidas", icon: MessagesSquare, permission: "tickets:reply" },
      { label: "Mensajes", href: "/admin/mensajes", icon: Inbox, badge: "mensajes", permission: "tickets:view" },
    ],
  },
  {
    title: "Sitio web",
    items: [
      site("Branding", "branding", Palette, "appearance:write"),
      // Panel de apariencia separado de /admin/site (tramo D).
      { label: "Apariencia", href: "/admin/apariencia", icon: Brush, permission: "appearance:write" },
      site("Contenido y contacto", "content", PenLine, "content:write"),
      site("Secciones del inicio", "sections", LayoutList, "content:write"),
      site("Catálogo y precios", "catalog", Tags, "catalog:write"),
      site("SEO", "seo", SearchCheck, "content:write"),
      site("Navegación", "nav", Navigation, "content:write"),
      { label: "Textos de páginas", href: "/admin/pages", icon: FileText, permission: "content:write" },
      { label: "Contenido", href: "/admin/contenido", icon: PenLine, permission: "content:write" },
      { label: "Base de conocimientos", href: "/admin/kb", icon: BookOpen, permission: "kb:write" },
    ],
  },
  {
    title: "Servidor WHM",
    items: [
      { label: "Cuentas cPanel", href: "/admin/accounts", icon: Server, permission: "whm:read" },
      { label: "Paquetes", href: "/admin/packages", icon: Package, permission: "whm:read" },
      { label: "Conexión WHM", href: "/admin/settings", icon: Settings, permission: "whm:read" },
      { label: "Alta automática", href: "/admin/provision", icon: ServerCog, permission: "whm:read" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { label: "General", href: "/admin/configuracion", icon: SlidersHorizontal, permission: "settings:write" },
      { label: "Plantillas de correo", href: "/admin/plantillas-correo", icon: Mail, permission: "mail:write" },
      { label: "Plugins", href: "/admin/plugins", icon: Plug, permission: "settings:write" },
      { label: "Usuarios", href: "/admin/usuarios", icon: UserCog, permission: "users:manage" },
    ],
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
  permissions,
}: {
  children: React.ReactNode;
  email?: string;
  /** Pendientes por sección. Se omiten si la base no respondió. */
  badges?: NavBadges;
  /**
   * Permisos de la sesión (los pasa el layout del servidor). Sin esta prop
   * se muestra todo (compatibilidad); con ella, se ocultan las secciones
   * sin permiso. El fallback por entorno llega como owner y ve todo.
   */
  permissions?: string[];
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
  // Contador de alertas sin leer (Fase 6, frente B): se lee del API en el
  // cliente, solo cuando la sesión puede ver la sección (permiso
  // `audit:view`; sin `permissions` se muestra todo por compatibilidad).
  // Si la lectura falla, el contador queda en 0 y el enlace sigue ahí.
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  useEffect(() => {
    if (permissions !== undefined && !permissions.includes("audit:view")) return;
    let cancelled = false;
    void fetch("/api/admin/alerts?unread=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.unread === "number") setUnreadAlerts(data.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [permissions, pathname]);
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

  const visibleGroups =
    permissions === undefined
      ? GROUPS
      : GROUPS.map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => !item.permission || permissions.includes(item.permission),
          ),
        })).filter((group) => group.items.length > 0);

  const crumb =
    visibleGroups.flatMap((g) => g.items).find((i) => isActive(pathname, section, i))
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
        {visibleGroups.map((group) => (
          <div className="admin-nav-group" key={group.title}>
            <p className="admin-nav-title">{group.title}</p>
            {group.items.map((item) => {
              // El contador de alertas viene del estado local (API en el
              // cliente); los demás vienen de `badges` (servidor).
              const badgeCount =
                item.badge === "alertas"
                  ? unreadAlerts
                  : item.badge
                    ? badges[item.badge]
                    : 0;
              return (
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
                {item.badge && badgeCount ? (
                  <span className="nav-badge">
                    {badgeCount}
                    <span className="sr-only"> pendientes</span>
                  </span>
                ) : null}
              </Link>
              );
            })}
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
