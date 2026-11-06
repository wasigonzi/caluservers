import type { Metadata } from "next";
import Comp from "@/components/site/DedicatedPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Servidores dedicados" };

export default async function Page() {
  const payload = await getPageContent("/dedicated");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
