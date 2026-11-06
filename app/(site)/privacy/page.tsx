import type { Metadata } from "next";
import { Privacy } from "@/components/site/LegalPages";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Política de privacidad" };

export default async function Page() {
  const payload = await getPageContent("/privacy");
  return (
    <PageContentProvider payload={payload}>
      <Privacy />
    </PageContentProvider>
  );
}
