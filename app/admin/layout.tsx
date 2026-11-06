import Link from "next/link";
import { isAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) return children;
  const links: [string, string][] = [
    ["Dashboard", "/admin"],
    ["Clientes", "/admin/clients"],
    ["Servicios", "/admin/services"],
    ["Pedidos", "/admin/orders"],
    ["Facturas", "/admin/invoices"],
    ["Productos", "/admin/products"],
    ["Tickets", "/admin/tickets"],
    ["Sitio PRO", "/admin/site"],
    ["Conexión WHMCS", "/admin/settings"],
  ];
  return (
    <div className="admin">
      <aside className="side">
        <Link className="brand" href="/admin">
          CALU<span className="accent">SERVERS</span>
        </Link>
        <p className="muted">Administración</p>
        {links.map(([label, url]) => (
          <Link href={url} key={url}>
            {label}
          </Link>
        ))}
        <form action="/api/admin/logout" method="post">
          <button className="btn" type="submit">
            Salir
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
