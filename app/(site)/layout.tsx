import { getSiteSettings } from "@/lib/site-settings-db";
import { CatalogProvider } from "@/lib/catalog-context";
import { SiteShell } from "@/components/site/SiteShell";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <CatalogProvider settings={settings}>
      <SiteShell settings={settings}>{children}</SiteShell>
    </CatalogProvider>
  );
}
