import "server-only";
import { db } from "@/lib/db";
import { renderMailTemplate } from "@/lib/mail-template-vars";

/**
 * Plantillas de correo editables (Fase 5, frente C).
 *
 * El mailer busca la plantilla ACTIVA en BD para la clave y el locale;
 * si no hay ninguna (o la BD no responde), devuelve el texto de reserva
 * que hoy envía el código. Sin SMTP las plantillas se guardan igual, solo
 * no se envían: `mailerConfigured()` no cambia.
 */

export type MailTemplateRow = {
  subject: string;
  body: string;
};

/** Plantilla activa para una clave, o null si no hay ninguna. */
export async function loadActiveMailTemplate(
  key: string,
  locale = "es",
): Promise<MailTemplateRow | null> {
  try {
    const row = await db.mailTemplate.findFirst({
      where: { key, locale, active: true },
      select: { subject: true, body: true },
    });
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Renderiza el envío con la plantilla activa de BD; sin ella, usa el
 * texto de reserva tal cual. Las variables sin valor quedan vacías.
 */
export async function renderMailWithTemplate(input: {
  key: string;
  locale?: string;
  variables: Record<string, string | undefined | null>;
  fallback: { subject: string; text: string };
}): Promise<{ subject: string; text: string }> {
  const template = await loadActiveMailTemplate(input.key, input.locale ?? "es");
  if (!template) return input.fallback;
  return renderMailTemplate(template, input.variables);
}
