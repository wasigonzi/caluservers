import type { Metadata } from "next";
import Comp from "@/components/site/AboutPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Nosotros" };

export default async function Page() {
  const payload = await getPageContent("/about");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
