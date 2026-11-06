import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { PAGE_DEFS } from "@/lib/page-content";
import {
  getAllPageContent,
  pageContentDbReady,
} from "@/lib/page-content-db";
import PageContentStudio from "@/components/admin/PageContentStudio";

export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [pages, db] = await Promise.all([
    getAllPageContent(),
    pageContentDbReady(),
  ]);
  const catalog = PAGE_DEFS.map((p) => ({
    path: p.path,
    label: p.label,
    description: p.description,
    sections: [...new Set(p.fields.map((f) => f.section))],
    fields: p.fields,
  }));
  return (
    <>
      <p className="accent">CONTENIDO · CMS</p>
      <h1>Textos de páginas</h1>
      <p className="muted">
        Edita títulos, leads, FAQ y copy de cada página pública sin tocar código.
        Texto plano (sin HTML). Requiere migración <code>PageContent</code>.
      </p>
      <PageContentStudio
        initialCatalog={catalog}
        initialPages={pages}
        initialDb={db}
      />
    </>
  );
}
