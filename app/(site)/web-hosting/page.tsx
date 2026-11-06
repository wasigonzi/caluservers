import type { Metadata } from "next";
import Comp from "@/components/site/WebHostingPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Web Hosting" };

export default async function Page() {
  const payload = await getPageContent("/web-hosting");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
