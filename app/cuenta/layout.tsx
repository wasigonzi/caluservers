import { SiteShell } from "@/components/site/SiteShell";
import { getPublicCatalog } from "@/lib/catalog-db";
import { CatalogProvider } from "@/lib/catalog-context";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getPublicCatalog();
  return (
    <CatalogProvider catalog={catalog}>
      <SiteShell settings={catalog.settings}>{children}</SiteShell>
    </CatalogProvider>
  );
}
