/**
 * Plantillas de correo: claves de envío y variables (módulo PURO, sin
 * imports: lo usan tanto el servidor (lib/mail-templates.ts) como el
 * componente de cliente que edita las plantillas).
 *
 * Una variable sin valor se renderiza VACÍA: el texto final nunca muestra
 * `{{variable}}`.
 */

/** Envíos que hoy existen y pueden llevar plantilla activa en BD. */
export const MAIL_TEMPLATE_KEYS = [
  "password-reset",
  "ticket-reply",
  "ticket-new-staff",
  "ticket-reply-staff",
] as const;

export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];

/** Variables disponibles por clave, con su descripción para el editor. */
export const TEMPLATE_VARIABLES: Record<MailTemplateKey, { name: string; label: string }[]> = {
  "password-reset": [
    { name: "resetUrl", label: "Enlace de restablecimiento (un solo uso)" },
  ],
  "ticket-reply": [
    { name: "ticketSubject", label: "Asunto del ticket" },
    { name: "ticketUrl", label: "Enlace al ticket en la cuenta del cliente" },
  ],
  "ticket-new-staff": [
    { name: "ticketSubject", label: "Asunto del ticket" },
    { name: "ticketUrl", label: "Enlace al ticket en el panel de admin" },
    { name: "customerEmail", label: "Correo del cliente" },
  ],
  "ticket-reply-staff": [
    { name: "ticketSubject", label: "Asunto del ticket" },
    { name: "ticketUrl", label: "Enlace al ticket en el panel de admin" },
    { name: "customerEmail", label: "Correo del cliente" },
  ],
};

/**
 * Sustituye `{{nombre}}` por su valor. Una variable sin valor (ausente,
 * null o undefined) queda vacía; nunca se deja el marcador en el texto.
 * Solo se sustituyen nombres `[\w.-]+`; el resto del texto no se toca.
 */
export function renderMailTemplateText(
  template: string,
  variables: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{\{([\w.-]+)\}\}/g, (_match, name: string) => {
    const value = variables[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Renderiza asunto y cuerpo de una plantilla con las mismas reglas. */
export function renderMailTemplate(
  template: { subject: string; body: string },
  variables: Record<string, string | undefined | null>,
): { subject: string; text: string } {
  return {
    subject: renderMailTemplateText(template.subject, variables),
    text: renderMailTemplateText(template.body, variables),
  };
}
