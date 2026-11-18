import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccessDenied from "@/components/admin/AccessDenied";
import CannedRepliesManager, { type CannedReplyRow } from "@/components/admin/CannedRepliesManager";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Respuestas predefinidas para tickets (Fase 5, frente C). Exigen
 * `tickets:reply`, el mismo permiso que responder un ticket.
 * DECISIÓN: página propia, no dentro de /admin/tickets, porque es
 * configuración (CRUD) y no parte del hilo de un ticket; el uso vive en
 * el formulario de respuesta de cada ticket, con un desplegable que
 * inserta el texto. Los textos sembrados son genéricos: el dueño debe
 * revisarlos antes de usarlos con clientes reales.
 */
export default async function CannedRepliesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("tickets:reply")) {
    return <AccessDenied permission="tickets:reply" />;
  }
  const rows = await db.cannedReply.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
  const replies: CannedReplyRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    locale: row.locale,
    category: row.category,
    order: row.order,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  }));
  return (
    <>
      <PageHeader
        eyebrow="TICKETS"
        title="Respuestas predefinidas"
        description="Textos que el agente inserta al responder un ticket, desde un desplegable en el formulario de respuesta. Los textos sembrados son genéricos: revísalos antes de usarlos con clientes reales."
      />
      <CannedRepliesManager initial={replies} />
    </>
  );
}
