import "server-only";
import { db } from "./db";
import {
  CONTACT_KINDS,
  intakeTopics,
  type ContactKind,
} from "./intake-options";
import { deliverNotice } from "./mailer";
import { requestThrottleId } from "./request-throttle";
import { isPlainText } from "./safe-links";

/**
 * Formularios propios de contacto y abuso.
 *
 * El mensaje se guarda en Postgres primero; el correo de aviso es un segundo paso
 * que puede fallar sin perder el mensaje (`delivered=false` y el panel lo muestra).
 * Si el guardado falla, la ruta responde 503: nunca se confirma un envío que no existe.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ContactError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ContactError";
  }
}

export type ContactInput = {
  kind: ContactKind;
  name: string;
  email: string;
  topic: string;
  target: string;
  body: string;
};

function one(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Un salto de línea en nombre o asunto es una cabecera de correo inyectada.
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/** Valida sin tocar la red ni la base. Devuelve el mensaje ya saneado. */
export function parseContactInput(raw: unknown): ContactInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ContactError("Formulario no válido.", 400);
  }
  const value = raw as Record<string, unknown>;
  const kind = one(value.kind, 16) as ContactKind;
  if (!(CONTACT_KINDS as readonly string[]).includes(kind)) {
    throw new ContactError("Formulario no válido.", 400);
  }
  const allowed = intakeTopics(kind);
  const name = one(value.name, 80);
  const email = one(value.email, 160).toLowerCase();
  const topic = one(value.topic, 40);
  const target = one(value.target, 120);
  const body = typeof value.body === "string" ? value.body.trim().slice(0, 4000) : "";

  if (name.length < 2 || !isPlainText(name, 80)) {
    throw new ContactError("Escribe tu nombre (sin < ni >).", 400);
  }
  if (!EMAIL_RE.test(email) || !isPlainText(email, 160)) {
    throw new ContactError("El email no es válido.", 400);
  }
  if (!allowed.includes(topic)) {
    throw new ContactError(
      kind === "abuse" ? "Elige una categoría de abuso." : "Elige un departamento.",
      400,
    );
  }
  if (kind === "abuse" && (target.length < 3 || !isPlainText(target, 120))) {
    throw new ContactError("Indica el dominio o la IP involucrada.", 400);
  }
  if (body.length < 10) {
    throw new ContactError("Cuéntanos algo más: el mensaje es demasiado corto.", 400);
  }
  if (!isPlainText(body, 4000)) {
    throw new ContactError("El mensaje no admite < ni >. Pega enlaces en texto plano.", 400);
  }
  return { kind, name, email, topic, target, body };
}

/** Dirección de aviso: la del panel si está puesta, si no `CONTACT_INBOX`. */
export async function noticeRecipient(): Promise<string> {
  const fallback = (process.env.CONTACT_INBOX || "").trim();
  try {
    const row = await db.siteSetting.findUnique({ where: { key: "contact" } });
    const value = row?.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const email = (value as Record<string, unknown>).email;
      if (typeof email === "string" && EMAIL_RE.test(email.trim())) return email.trim();
    }
  } catch {
    // El aviso no manda sobre el guardado: si no se puede leer el ajuste, queda el env.
  }
  return EMAIL_RE.test(fallback) ? fallback : "";
}

export function noticeSubject(input: ContactInput): string {
  return input.kind === "abuse"
    ? `[Abuso · ${input.topic}] ${input.target}`
    : `[${input.topic}] Mensaje de ${input.name}`;
}

export function noticeBody(input: ContactInput, id: string): string {
  return [
    `Formulario: ${input.kind === "abuse" ? "reporte de abuso" : "contacto"}`,
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    input.kind === "abuse" ? `Categoría: ${input.topic}` : `Departamento: ${input.topic}`,
    input.target ? `Dominio o IP: ${input.target}` : "",
    "",
    input.body,
    "",
    `Referencia: ${id}`,
    "Responde al cliente desde tu correo; esta web no envía respuestas.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Guarda el mensaje y luego intenta el aviso por correo.
 * `clientKey` se almacena como HMAC: sirve para ver abuso repetido sin guardar la IP.
 */
export async function submitContactMessage(input: ContactInput, rawClientKey: string) {
  const stored = await db.contactMessage.create({
    data: {
      kind: input.kind,
      name: input.name,
      email: input.email,
      topic: input.topic,
      target: input.target || null,
      body: input.body,
      status: "new",
      delivered: false,
      clientKey: requestThrottleId("contact", rawClientKey),
    },
    select: { id: true },
  });

  let delivered = false;
  const to = await noticeRecipient();
  if (to) {
    try {
      const result = await deliverNotice({
        to,
        replyTo: input.email,
        subject: noticeSubject(input),
        text: noticeBody(input, stored.id),
      });
      delivered = result.delivered;
    } catch {
      // Un SMTP caído no borra el mensaje. Queda `delivered=false` y visible en el panel.
      delivered = false;
    }
  }
  if (delivered) {
    try {
      await db.contactMessage.update({
        where: { id: stored.id },
        data: { delivered: true },
      });
    } catch {
      // La marca es informativa; el mensaje ya está guardado.
    }
  }
  return { id: stored.id, delivered, notifiable: Boolean(to) };
}
