import type { Metadata } from "next";
import Comp from "@/components/site/AbusePage";
import { getPageContent } from "@/lib/page-content-db";
import { PageContentProvider } from "@/lib/page-content-context";

export const metadata: Metadata = { title: "Abuso" };

export default async function Page() {
  const payload = await getPageContent("/abuse");
  return (
    <PageContentProvider payload={payload}>
      <Comp />
    </PageContentProvider>
  );
}
