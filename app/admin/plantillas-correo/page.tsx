import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccessDenied from "@/components/admin/AccessDenied";
import MailTemplatesManager, { type MailTemplateRow } from "@/components/admin/MailTemplatesManager";
import { PageHeader } from "@/components/admin/ui";
import { TEMPLATE_VARIABLES } from "@/lib/mail-template-vars";

export const dynamic = "force-dynamic";

/**
 * Plantillas de correo editables (Fase 5, frente C). Exige `mail:write`.
 * La plantilla activa sustituye el asunto y el cuerpo del envío; sin
 * plantilla activa, el envío usa el texto del código. Sin SMTP las
 * plantillas se guardan igual, solo no se envían.
 */
export default async function MailTemplatesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.permissions.includes("mail:write")) {
    return <AccessDenied permission="mail:write" />;
  }
  const rows = await db.mailTemplate.findMany({
    orderBy: [{ key: "asc" }, { locale: "asc" }],
  });
  const templates: MailTemplateRow[] = rows.map((row) => ({
    id: row.id,
    key: row.key,
    locale: row.locale,
    subject: row.subject,
    body: row.body,
    variablesJson: row.variablesJson,
    variables: TEMPLATE_VARIABLES[row.key as keyof typeof TEMPLATE_VARIABLES] ?? [],
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  }));
  return (
    <>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Plantillas de correo"
        description="Asunto y cuerpo de los correos que envía el sistema (restablecimiento de contraseña y avisos de tickets). Una variable sin valor se deja vacía, nunca se muestra como {{variable}}. Sin SMTP las plantillas se guardan igual, solo no se envían."
      />
      <MailTemplatesManager initial={templates} />
    </>
  );
}
