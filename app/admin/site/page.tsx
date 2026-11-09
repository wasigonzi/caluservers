import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import { getCatalogPayload } from "@/lib/catalog-db";
import { cmsStorageReady } from "@/lib/page-content-db";
import { isBlobConfiguredEnv } from "@/lib/branding-upload";
import ProSiteStudio from "@/components/admin/ProSiteStudio";

export const dynamic = "force-dynamic";

export default async function SiteAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [settings, catalog, storage] = await Promise.all([
    getSiteSettings(),
    getCatalogPayload(),
    cmsStorageReady(),
  ]);
  const blobConfigured = isBlobConfiguredEnv();
  return (
    <>
      <p className="accent">IDENTIDAD / EXPERIENCIA</p>
      <h1>Tu marca, bajo control</h1>
      <p className="muted">
        Branding (URL o subida a Vercel Blob), apariencia, contenido, secciones,
        catálogo, SEO y navegación. Publicación unificada. Requiere la migración
        de contenido y la de <code>AdminAudit</code> / <code>IntegrationConfig</code>.
        Las subidas usan <code>BLOB_READ_WRITE_TOKEN</code>. WHM es sólo lectura;
        la API WHMCS del panel está retirada.
      </p>
      <div className="studio-container">
        <ProSiteStudio
          initialSettings={settings}
          initialCatalog={catalog}
          blobConfigured={blobConfigured}
          storageReady={storage.ok}
        />
      </div>
    </>
  );
}
