import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import { getCatalogPayload } from "@/lib/catalog-db";
import ProSiteStudio from "@/components/admin/ProSiteStudio";

export const dynamic = "force-dynamic";

export default async function SiteAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [settings, catalog] = await Promise.all([
    getSiteSettings(),
    getCatalogPayload(),
  ]);
  return (
    <>
      <p className="accent">ESTUDIO DEL SITIO · PRO</p>
      <h1>Configuración avanzada</h1>
      <p className="muted">
        Branding, apariencia, contenido, secciones, catálogo, SEO y navegación.
        Publicación unificada. Requiere migraciones{" "}
        <code>SiteSetting</code> y <code>CatalogConfig</code> aplicadas en tu
        base de datos. WHMCS API sigue en «Conexión WHMCS».
      </p>
      <div className="glass">
        <ProSiteStudio initialSettings={settings} initialCatalog={catalog} />
      </div>
    </>
  );
}
