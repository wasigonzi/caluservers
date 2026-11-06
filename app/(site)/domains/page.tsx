import type { Metadata } from "next";
import Comp from "@/components/site/DomainsPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Dominios" };

export default async function Page() {
  const payload = await getPageContent("/domains");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
