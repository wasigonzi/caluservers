import type { Metadata } from "next";
import { Terms } from "@/components/site/LegalPages";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default async function Page() {
  const payload = await getPageContent("/terms");
  return (
    <PageContentProvider payload={payload}>
      <Terms />
    </PageContentProvider>
  );
}
