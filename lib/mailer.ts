import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderMailWithTemplate } from "@/lib/mail-templates";

export type AuthMailKind = "reset";

/**
 * Mensaje honesto cuando no hay correo saliente. Lo usan la página de
 * recuperación (vía prop) y `sendResetPassword`: sin SMTP no se promete
 * ningún enlace. Misma frase en ambos sitios para que no diverjan.
 */
export const RESET_MAIL_UNAVAILABLE_MESSAGE =
  "El restablecimiento por correo no está activo. No se envió ningún enlace: contacta a soporte@caluservers.com para recuperar tu cuenta.";

/**
 * Cierto solo si existe una vía real de envío. El sumidero de archivos cuenta
 * fuera de producción porque las pruebas leen de ahí; en producción, no.
 */
export function mailerConfigured(): boolean {
  if ((process.env.SMTP_URL || "").trim()) return true;
  return Boolean(
    (process.env.MAIL_SINK_DIR || "").trim() && process.env.NODE_ENV !== "production",
  );
}

/**
 * Sends reset links. The link is never logged or returned.
 * A file sink exists only outside production so tests can read the message.
 */
export async function deliverAuthLink(input: {
  to: string;
  kind: AuthMailKind;
  url: string;
}): Promise<{ delivered: boolean; reason: "smtp" | "sink" | "unconfigured" }> {
  // Plantilla activa `password-reset` si existe; si no, el texto de siempre.
  const rendered = await renderMailWithTemplate({
    key: "password-reset",
    variables: { resetUrl: input.url },
    fallback: {
      subject: "Restablece tu contraseña de CaluServers",
      text: [
        "Este enlace es de un solo uso y caduca.",
        "Si no solicitaste este mensaje, ignóralo.",
        input.url,
      ].join("\n"),
    },
  });
  const subject = rendered.subject;
  const text = rendered.text;
  const smtp = (process.env.SMTP_URL || "").trim();
  if (smtp) {
    await sendSmtp({ to: input.to, subject, text, smtp });
    return { delivered: true, reason: "smtp" };
  }
  const sink = (process.env.MAIL_SINK_DIR || "").trim();
  if (sink && process.env.NODE_ENV !== "production") {
    await mkdir(sink, { recursive: true });
    const file = path.join(sink, `${Date.now()}-${input.kind}.txt`);
    await writeFile(file, `to:${input.to}\nkind:${input.kind}\n${text}\n`, { mode: 0o600 });
    return { delivered: true, reason: "sink" };
  }
  return { delivered: false, reason: "unconfigured" };
}

/**
 * Avisos internos (formulario de contacto, abuso, credenciales de alta).
 * Sin SMTP no se inventa un envío: devuelve `delivered: false` y quien llama lo refleja.
 * El sumidero de archivos solo existe fuera de producción.
 */
export async function deliverNotice(input: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /**
   * Plantilla activa a usar (p. ej. `ticket-reply`). Si se pasa y existe,
   * sustituye asunto y texto; si no existe, se usa el asunto/texto dados.
   */
  templateKey?: string;
  variables?: Record<string, string | undefined | null>;
}): Promise<{ delivered: boolean; reason: "smtp" | "sink" | "unconfigured" }> {
  let subject = input.subject;
  let text = input.text;
  if (input.templateKey) {
    const rendered = await renderMailWithTemplate({
      key: input.templateKey,
      variables: input.variables ?? {},
      fallback: { subject, text },
    });
    subject = rendered.subject;
    text = rendered.text;
  }
  const smtp = (process.env.SMTP_URL || "").trim();
  if (smtp) {
    await sendSmtp({
      to: input.to,
      subject,
      text,
      smtp,
      replyTo: input.replyTo,
    });
    return { delivered: true, reason: "smtp" };
  }
  const sink = (process.env.MAIL_SINK_DIR || "").trim();
  if (sink && process.env.NODE_ENV !== "production") {
    await mkdir(sink, { recursive: true });
    const file = path.join(sink, `${Date.now()}-notice.txt`);
    await writeFile(
      file,
      `to:${input.to}\nsubject:${subject}\n${text}\n`,
      { mode: 0o600 },
    );
    return { delivered: true, reason: "sink" };
  }
  return { delivered: false, reason: "unconfigured" };
}

async function sendSmtp(input: {
  to: string;
  subject: string;
  text: string;
  smtp: string;
  replyTo?: string;
}) {
  const url = new URL(input.smtp);
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: url.hostname,
    port: Number(url.port || 587),
    secure: url.protocol === "smtps:",
    auth: url.username
      ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || "no-reply@localhost",
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
}
