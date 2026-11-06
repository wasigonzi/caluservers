import type { Metadata } from "next";
import Comp from "@/components/site/HomePage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Web Hosting • VPS • Dedicated Servers" };

export default async function Page() {
  const payload = await getPageContent("/");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
