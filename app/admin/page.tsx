import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Palette,
  FileText,
  ArrowUpRight,
  PlugZap,
  Users,
  ShoppingBag,
  Receipt,
  Server,
} from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { configuration, whmcsCall } from "@/lib/whmcs";
export const dynamic = "force-dynamic";
async function count(action: string) {
  try {
    return String(
      (await whmcsCall(action, { limitnum: "1" })).totalresults ?? "—",
    );
  } catch {
    return "—";
  }
}
export default async function Admin() {
  if (!(await isAdmin())) redirect("/admin/login");
  let configured = false;
  try {
    configured = !!(await configuration());
  } catch {}
  const actions = [
    "GetClients",
    "GetOrders",
    "GetInvoices",
    "GetClientsProducts",
  ];
  const values = configured
    ? await Promise.all(actions.map(count))
    : ["—", "—", "—", "—"];
  const metrics = [
    { label: "Clientes", Icon: Users, href: "/admin/clients" },
    { label: "Pedidos", Icon: ShoppingBag, href: "/admin/orders" },
    { label: "Facturas", Icon: Receipt, href: "/admin/invoices" },
    { label: "Servicios", Icon: Server, href: "/admin/services" },
  ];
  return (
    <>
      <header className="dashboard-heading">
        <div>
          <p className="studio-eyebrow">CENTRO DE CONTROL</p>
          <h1>Tu sitio. Tu marca.</h1>
          <p className="muted">
            Contenido, identidad y operaciones en un mismo lugar.
          </p>
        </div>
        <Link
          className="btn secondary"
          href="/"
          target="_blank"
          rel="noreferrer"
        >
          Ver sitio <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <section className="dashboard-workspaces" aria-label="Accesos de gestión">
        <Link className="workspace-card workspace-primary" href="/admin/site">
          <Palette size={26} aria-hidden="true" />
          <span className="studio-eyebrow">ESTUDIO DE MARCA</span>
          <h2>Dale forma a tu identidad</h2>
          <p>
            Logos, paleta y apariencia. Previsualiza tus cambios antes de
            publicarlos.
          </p>
          <span className="workspace-link">
            Abrir estudio <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </Link>
        <Link className="workspace-card" href="/admin/pages">
          <FileText size={26} aria-hidden="true" />
          <span className="studio-eyebrow">CONTENIDO</span>
          <h2>Cada página, a tu manera</h2>
          <p>
            Edita los textos de tu web y mantén el contenido alineado con tu
            marca.
          </p>
          <span className="workspace-link">
            Editar páginas <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </Link>
      </section>
      <div className="dashboard-section-heading">
        <div>
          <h2>Operaciones</h2>
          <p className="muted">
            Datos de WHMCS · «—» indica información no disponible, no un valor
            cero.
          </p>
        </div>
        <span className="pill">
          {configured ? "Configuración disponible" : "Sin conexión configurada"}
        </span>
      </div>
      <div className="metrics">
        {metrics.map(({ label, Icon, href }, i) => (
          <Link className="glass metric" href={href} key={label}>
            <div className="metric-label">
              <Icon size={18} aria-hidden="true" />
              {label}
            </div>
            <strong>{values[i]}</strong>
            <span className="muted">
              {values[i] === "—" ? "No disponible" : "Total consultado"}
            </span>
          </Link>
        ))}
      </div>
      <section className="dashboard-integration">
        <PlugZap size={22} aria-hidden="true" />
        <div>
          <h3>Integración WHMCS</h3>
          <p className="muted">
            {configured
              ? "La configuración guardada no garantiza conectividad. Los datos disponibles aparecen arriba."
              : "Conecta el sistema para consultar registros reales. El editor del sitio sigue disponible."}
          </p>
        </div>
        <Link className="btn secondary" href="/admin/settings">
          Revisar conexión →
        </Link>
      </section>
    </>
  );
}
