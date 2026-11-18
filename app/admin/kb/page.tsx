import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { PageHeader } from "@/components/admin/ui";
import KbManager from "@/components/admin/KbManager";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Base de conocimientos" };

export default async function AdminKbPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("kb:write")) {
    return <AccessDenied permission="kb:write" />;
  }
  let articles: Awaited<ReturnType<typeof db.kbArticle.findMany>> = [];
  let dbError = false;
  try {
    articles = await db.kbArticle.findMany({ orderBy: [{ order: "asc" }, { slug: "asc" }] });
  } catch {
    dbError = true;
  }
  return (
    <>
      <PageHeader
        eyebrow="SITIO WEB"
        title="Base de conocimientos"
        description="Artículos públicos de /kb por idioma y categoría. Solo los publicados se ven en público; sin traducción al inglés, el artículo se sirve en español."
      />
      {dbError ? (
        <p className="notice banner-warn" role="status">
          La base de datos no respondió o falta la migración 20261118060000_content_kb. Ejecuta prisma migrate deploy.
        </p>
      ) : null}
      <KbManager initialArticles={articles} />
    </>
  );
}
