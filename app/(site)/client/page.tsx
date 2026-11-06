import type { Metadata } from "next";
import Comp from "@/components/site/ClientPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Área de cliente" };

export default async function Page() {
  const payload = await getPageContent("/client");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
