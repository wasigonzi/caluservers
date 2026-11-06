import type { Metadata } from "next";
import Comp from "@/components/site/ContactPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Contacto" };

export default async function Page() {
  const payload = await getPageContent("/contact");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
