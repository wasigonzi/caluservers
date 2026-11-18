import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import { getCatalogPayload } from "@/lib/catalog-db";
import { cmsStorageReady } from "@/lib/page-content-db";
import { isBlobConfiguredEnv } from "@/lib/branding-upload";
import ProSiteStudio from "@/components/admin/ProSiteStudio";
import AccessDenied from "@/components/admin/AccessDenied";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Panel de apariencia, separado de /admin/site (Fase 1, tramo D — RBAC).
 * Solo branding y apariencia (nombre, logos, favicon, paleta, tipografía,
 * radios y sombras); el contenido, las secciones, el catálogo, el SEO y la
 * navegación siguen en /admin/site. Exige `appearance:write`.
 *
 * Nota de guardado: «Guardar y publicar» publica todo el bundle de ajustes
 * y además el catálogo, así que también pide `content:write` (ajustes) y
 * `catalog:write` (catálogo) en sus rutas; owner y admin tienen los tres.
 */
const HEADINGS: Record<string, { title: string; description: string }> = {
  branding: {
    title: "Branding",
    description:
      "Nombre de la marca, logos, favicon e imagen para redes. Pega una URL https o sube el archivo.",
  },
  appearance: {
    title: "Apariencia",
    description:
      "Paleta, tipografía, radios y sombras del sitio público, con comprobación de contraste.",
  },
};

const APPEARANCE_TABS = ["branding", "appearance"];

export default async function AppearanceAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("appearance:write")) {
    return <AccessDenied permission="appearance:write" />;
  }
  const [settings, catalog, storage] = await Promise.all([
    getSiteSettings(),
    getCatalogPayload(),
    cmsStorageReady(),
  ]);
  const blobConfigured = isBlobConfiguredEnv();
  const { seccion } = await searchParams;
  const tab = seccion && APPEARANCE_TABS.includes(seccion) ? seccion : "branding";
  const heading = HEADINGS[tab] ?? HEADINGS.branding;
  return (
    <>
      <PageHeader
        eyebrow="SITIO WEB · APARIENCIA"
        title={heading.title}
        description={
          <>
            {heading.description} Los cambios se publican juntos con el botón
            «Guardar y publicar». Publicar también guarda el catálogo, así que
            hace falta además `catalog:write`.
          </>
        }
      />
      <div className="studio-container">
        <ProSiteStudio
          initialSettings={settings}
          initialCatalog={catalog}
          blobConfigured={blobConfigured}
          storageReady={storage.ok}
          initialTab={tab}
          allowedTabs={APPEARANCE_TABS}
          basePath="/admin/apariencia"
        />
      </div>
    </>
  );
}
