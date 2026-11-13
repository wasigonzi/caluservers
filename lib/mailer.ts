import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type AuthMailKind = "verify" | "reset";

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
 * Sends verification and reset links. The link is never logged or returned.
 * A file sink exists only outside production so tests can read the message.
 */
export async function deliverAuthLink(input: {
  to: string;
  kind: AuthMailKind;
  url: string;
}): Promise<{ delivered: boolean; reason: "smtp" | "sink" | "unconfigured" }> {
  const subject =
    input.kind === "verify"
      ? "Verifica tu cuenta de CaluServers"
      : "Restablece tu contraseña de CaluServers";
  const text = [
    "Este enlace es de un solo uso y caduca.",
    "Si no solicitaste este mensaje, ignóralo.",
    input.url,
  ].join("\n");
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
}): Promise<{ delivered: boolean; reason: "smtp" | "sink" | "unconfigured" }> {
  const smtp = (process.env.SMTP_URL || "").trim();
  if (smtp) {
    await sendSmtp({
      to: input.to,
      subject: input.subject,
      text: input.text,
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
      `to:${input.to}\nsubject:${input.subject}\n${input.text}\n`,
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
