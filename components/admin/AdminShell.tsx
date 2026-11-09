"use client";

import {
  LayoutDashboard,
  Palette,
  FileText,
  Users,
  Server,
  Package,
  Settings,
  ExternalLink,
  Menu,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const NAV_ICONS = {
  "/admin": LayoutDashboard,
  "/admin/site": Palette,
  "/admin/pages": FileText,
  "/admin/comercio": Users,
  "/admin/accounts": Server,
  "/admin/packages": Package,
  "/admin/settings": Settings,
};
type NavItem = { label: string; href: keyof typeof NAV_ICONS };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Resumen",
    items: [{ label: "Dashboard", href: "/admin" }],
  },
  {
    title: "Sitio",
    items: [
      { label: "Marca y sitio", href: "/admin/site" },
      { label: "Páginas / contenido", href: "/admin/pages" },
      { label: "Clientes propios", href: "/admin/comercio" },
    ],
  },
  {
    title: "WHM / cPanel",
    items: [
      { label: "Cuentas", href: "/admin/accounts" },
      { label: "Paquetes", href: "/admin/packages" },
    ],
  },
  {
    title: "Ajustes",
    items: [{ label: "Conexión WHM", href: "/admin/settings" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string;
}) {
  const pathname = usePathname();
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
  }, [pathname]);

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
    GROUPS.flatMap((g) => g.items).find((i) => isActive(pathname, i.href))
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
                  isActive(pathname, item.href)
                    ? "admin-nav-link active"
                    : "admin-nav-link"
                }
                aria-current={
                  isActive(pathname, item.href) ? "page" : undefined
                }
                onClick={() => setOpen(false)}
              >
                {(() => {
                  const Icon = NAV_ICONS[item.href];
                  return <Icon size={18} aria-hidden="true" />;
                })()}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-side-foot">
        {email ? <p className="muted admin-user">{email}</p> : null}
        <button
          className="btn admin-logout"
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
