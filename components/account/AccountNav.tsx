"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/cuenta", label: "Resumen", exact: true },
  { href: "/cuenta/tickets", label: "Tickets" },
  { href: "/web-hosting", label: "Planes" },
  { href: "/cuenta/entrar", label: "Entrar", exact: true },
  { href: "/cuenta/registro", label: "Crear cuenta", exact: true },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="account-nav" aria-label="Área de cliente">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
