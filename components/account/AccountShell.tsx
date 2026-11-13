"use client";

import {
  Boxes,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Receipt,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { customerAuthClient } from "@/lib/customer-auth-client";

type Item = { label: string; href: string; icon: LucideIcon; badge?: "facturas" | "tickets" };

const ITEMS: Item[] = [
  { label: "Resumen", href: "/cuenta", icon: LayoutDashboard },
  { label: "Mis servicios", href: "/cuenta/servicios", icon: Boxes },
  { label: "Facturas", href: "/cuenta/facturas", icon: Receipt, badge: "facturas" },
  { label: "Soporte", href: "/cuenta/tickets", icon: LifeBuoy, badge: "tickets" },
  { label: "Mi perfil", href: "/cuenta/perfil", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/cuenta") return pathname === "/cuenta";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Armazón del área de cliente: menú lateral, cajón en móvil y cierre de sesión. */
export default function AccountShell({
  children,
  name,
  email,
  badges,
}: {
  children: React.ReactNode;
  name: string;
  email: string;
  badges: { facturas: number; tickets: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const asideId = useId();

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
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    asideRef.current?.querySelector<HTMLElement>("a[href],button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
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

  const current = ITEMS.find((item) => isActive(pathname, item.href))?.label ?? "Mi cuenta";

  return (
    <div className={`admin-app account-app${open ? " drawer-open" : ""}`}>
      <a href="#account-content" className="admin-skip-link">
        Ir al contenido
      </a>
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-expanded={open}
          aria-controls={asideId}
          onClick={() => setOpen((value) => !value)}
        >
          <Menu size={18} aria-hidden="true" /> Menú
        </button>
        <div className="admin-breadcrumb">
          <span className="muted">Mi cuenta</span>
          <span aria-hidden="true"> / </span>
          <strong>{current}</strong>
        </div>
      </header>
      <div className="admin-overlay" hidden={!open} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside
        ref={asideRef}
        className="admin-sidebar"
        id={asideId}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
      >
        <button type="button" className="admin-drawer-close" onClick={() => setOpen(false)}>
          Cerrar menú ×
        </button>
        <Link className="admin-brand" href="/cuenta">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/monograma-cs.svg" width="36" height="36" alt="" />
          <span>
            CALU<span className="accent">SERVERS</span>
          </span>
        </Link>
        <p className="admin-side-sub muted">Área de cliente</p>
        <nav className="admin-nav" aria-label="Mi cuenta">
          <div className="admin-nav-group">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "admin-nav-link active" : "admin-nav-link"}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  {count ? (
                    <span className="nav-badge">
                      {count}
                      <span className="sr-only"> pendientes</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          <Link className="btn account-new" href="/web-hosting">
            <Plus size={16} aria-hidden="true" /> Contratar un servicio
          </Link>
        </nav>
        <div className="admin-side-foot">
          <p className="account-user">
            <strong>{name || "Cliente"}</strong>
            <span className="muted">{email}</span>
          </p>
          <button
            className="btn secondary admin-logout"
            type="button"
            onClick={async () => {
              await customerAuthClient.signOut().catch(() => {});
              router.push("/cuenta/entrar");
              router.refresh();
            }}
          >
            <LogOut size={16} aria-hidden="true" /> Salir
          </button>
          <Link className="admin-view-site" href="/">
            Volver al sitio <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <main id="account-content" tabIndex={-1} className="admin-main">
        {children}
      </main>
    </div>
  );
}
