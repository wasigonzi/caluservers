import type { Metadata } from "next";
import Comp from "@/components/site/VpsPage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "VPS Cloud" };

export default async function Page() {
  const payload = await getPageContent("/vps");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
