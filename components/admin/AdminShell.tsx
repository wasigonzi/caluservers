"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

type NavItem = { label: string; href: string };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Resumen",
    items: [{ label: "Dashboard", href: "/admin" }],
  },
  {
    title: "Sitio",
    items: [
      { label: "Estudio PRO", href: "/admin/site" },
      { label: "Páginas / contenido", href: "/admin/pages" },
      { label: "TEMP BD setup", href: "/admin/db-setup" },
    ],
  },
  {
    title: "Catálogo & WHMCS",
    items: [
      { label: "Clientes", href: "/admin/clients" },
      { label: "Servicios", href: "/admin/services" },
      { label: "Pedidos", href: "/admin/orders" },
      { label: "Facturas", href: "/admin/invoices" },
      { label: "Productos", href: "/admin/products" },
      { label: "Tickets", href: "/admin/tickets" },
    ],
  },
  {
    title: "Ajustes",
    items: [{ label: "Conexión WHMCS", href: "/admin/settings" }],
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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const crumb =
    GROUPS.flatMap((g) => g.items).find((i) => isActive(pathname, i.href))
      ?.label || "Admin";

  const nav = (
    <>
      <Link className="admin-brand" href="/admin" onClick={() => setOpen(false)}>
        CALU<span className="accent">SERVERS</span>
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
                  isActive(pathname, item.href) ? "admin-nav-link active" : "admin-nav-link"
                }
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-side-foot">
        {email ? <p className="muted admin-user">{email}</p> : null}
        <form action="/api/admin/logout" method="post">
          <button className="btn admin-logout" type="submit">
            Salir
          </button>
        </form>
        <Link className="admin-view-site" href="/" target="_blank" rel="noreferrer">
          Ver sitio →
        </Link>
      </div>
    </>
  );

  return (
    <div className={`admin-app${open ? " drawer-open" : ""}`}>
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-expanded={open}
          aria-controls={titleId}
          onClick={() => setOpen((v) => !v)}
        >
          ☰ Menú
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
      <aside className="admin-sidebar" id={titleId}>
        {nav}
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
