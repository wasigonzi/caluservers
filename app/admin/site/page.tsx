import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import { getCatalogPayload } from "@/lib/catalog-db";
import { cmsStorageReady } from "@/lib/page-content-db";
import { isBlobConfiguredEnv } from "@/lib/branding-upload";
import ProSiteStudio from "@/components/admin/ProSiteStudio";
import { STUDIO_TABS } from "@/lib/studio-tabs";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const HEADINGS: Record<string, { title: string; description: string }> = {
  branding: {
    title: "Branding",
    description: "Nombre de la marca, logos, favicon e imagen para redes. Pega una URL https o sube el archivo.",
  },
  appearance: {
    title: "Apariencia",
    description: "Paleta, tipografía, radios y sombras del sitio público, con comprobación de contraste.",
  },
  content: {
    title: "Contenido y contacto",
    description: "Texto principal de la portada, botones, datos de contacto, redes y el aviso de la cabecera.",
  },
  sections: {
    title: "Secciones del inicio",
    description: "Qué bloques muestra la portada y en qué orden.",
  },
  catalog: {
    title: "Catálogo y precios",
    description: "Planes de hosting, VPS y dedicados: nombre, precio, características y si están a la venta.",
  },
  seo: {
    title: "SEO",
    description: "Título, descripción e imagen que ven los buscadores y las redes al compartir el sitio.",
  },
  nav: {
    title: "Navegación",
    description: "Cabecera, pie y barra inferior en móvil.",
  },
  preview: {
    title: "Vista previa",
    description: "Cómo queda el sitio con los cambios sin publicar, en escritorio y móvil.",
  },
};

export default async function SiteAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const [settings, catalog, storage] = await Promise.all([
    getSiteSettings(),
    getCatalogPayload(),
    cmsStorageReady(),
  ]);
  const blobConfigured = isBlobConfiguredEnv();
  const { seccion } = await searchParams;
  const tab = seccion && STUDIO_TABS.includes(seccion) ? seccion : "branding";
  const heading = HEADINGS[tab] ?? HEADINGS.branding;
  return (
    <>
      <PageHeader
        eyebrow="SITIO WEB"
        title={heading.title}
        description={
          <>
            {heading.description} Los cambios de todas las secciones del sitio se publican juntos
            con el botón «Guardar y publicar».
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
        />
      </div>
    </>
  );
}
