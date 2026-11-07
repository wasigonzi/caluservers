import { redirect } from "next/navigation";
import Link from "next/link";
import { Palette, FileText, ArrowUpRight, PlugZap } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { whmConfiguration } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import WhmReadPanel from "@/components/admin/WhmReadPanel";
export const dynamic = "force-dynamic";
export default async function Admin() {
  if (!(await isAdmin())) redirect("/admin/login");
  let configured = false,
    storageError = "";
  try {
    configured = (await whmConfiguration()).configured;
  } catch (error) {
    storageError = safeWhmError(error).message;
  }
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
      <WhmReadPanel configured={configured} storageError={storageError} />
      <section className="dashboard-integration">
        <PlugZap size={22} aria-hidden="true" />
        <div>
          <h3>Conexión WHM / cPanel</h3>
          <p className="muted">
            Administra cuentas y paquetes con confirmación explícita. Sin
            eliminación, cambios de contraseña ni facturación.
          </p>
        </div>
        <Link className="btn secondary" href="/admin/settings">
          Revisar configuración →
        </Link>
      </section>
    </>
  );
}
