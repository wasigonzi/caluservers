import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { PageHeader } from "@/components/admin/ui";
import ContentManager from "@/components/admin/ContentManager";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contenido" };

export default async function AdminContentPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("content:write")) {
    return <AccessDenied permission="content:write" />;
  }
  let items: Awaited<ReturnType<typeof db.contentItem.findMany>> = [];
  let sections: Awaited<ReturnType<typeof db.contentSection.findMany>> = [];
  let dbError = false;
  try {
    [items, sections] = await Promise.all([
      db.contentItem.findMany({ orderBy: [{ kind: "asc" }, { order: "asc" }, { slug: "asc" }] }),
      db.contentSection.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] }),
    ]);
  } catch {
    dbError = true;
  }
  return (
    <>
      <PageHeader
        eyebrow="SITIO WEB"
        title="Contenido"
        description="Testimonios, socios, proyectos y FAQ por idioma. Solo lo publicado se muestra en el portal; las secciones vacías o sin publicar se ocultan solas, sin texto de relleno."
      />
      {dbError ? (
        <p className="notice banner-warn" role="status">
          La base de datos no respondió o falta la migración 20261118060000_content_kb. Ejecuta prisma migrate deploy.
        </p>
      ) : null}
      <ContentManager initialItems={items} initialSections={sections} />
    </>
  );
}
