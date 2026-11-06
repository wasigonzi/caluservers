import type { Metadata } from "next";
import { getPublicCatalog } from "@/lib/catalog-db";
import { CatalogProvider } from "@/lib/catalog-context";
import { SiteShell } from "@/components/site/SiteShell";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getPublicCatalog();
  const { seo, branding } = catalog.settings;
  const icons = branding.faviconUrl
    ? { icon: branding.faviconUrl }
    : undefined;
  return {
    title: {
      default: seo.title || branding.siteName,
      template: `%s | ${branding.siteName}`,
    },
    description: seo.description,
    openGraph: {
      title: seo.ogTitle || seo.title,
      description: seo.ogDescription || seo.description,
      siteName: branding.siteName,
      locale: "es_ES",
      type: "website",
      images: branding.ogImageUrl ? [{ url: branding.ogImageUrl }] : undefined,
    },
    icons,
    alternates: { languages: { es: "/", "x-default": "/" } },
  };
}

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const catalog = await getPublicCatalog();
  return (
    <CatalogProvider catalog={catalog}>
      <SiteShell settings={catalog.settings}>{children}</SiteShell>
    </CatalogProvider>
  );
}
