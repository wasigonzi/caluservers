import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import { getCatalogPayload } from "@/lib/catalog-db";
import { isBlobConfiguredEnv } from "@/lib/branding-upload";
import ProSiteStudio from "@/components/admin/ProSiteStudio";

export const dynamic = "force-dynamic";

export default async function SiteAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [settings, catalog] = await Promise.all([
    getSiteSettings(),
    getCatalogPayload(),
  ]);
  const blobConfigured = isBlobConfiguredEnv();
  return (
    <>
      <p className="accent">IDENTIDAD / EXPERIENCIA</p>
      <h1>Tu marca, bajo control</h1>
      <p className="muted">
        Branding (URL o subida a Vercel Blob), apariencia, contenido, secciones,
        catálogo, SEO y navegación. Publicación unificada. Requiere migraciones{" "}
        <code>SiteSetting</code> / <code>CatalogConfig</code> y, para subidas,{" "}
        <code>BLOB_READ_WRITE_TOKEN</code>. WHM / cPanel de sólo lectura en «Conexión WHM».
      </p>
      <div className="studio-container">
        <ProSiteStudio
          initialSettings={settings}
          initialCatalog={catalog}
          blobConfigured={blobConfigured}
        />
      </div>
    </>
  );
}
