import type { Metadata } from "next";
import { Aup } from "@/components/site/LegalPages";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Política de uso aceptable" };

export default async function Page() {
  const payload = await getPageContent("/aup");
  return (
    <PageContentProvider payload={payload}>
      <Aup />
    </PageContentProvider>
  );
}
