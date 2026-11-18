import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

/**
 * Adjuntos de ticket (Fase 5, frente C).
 *
 * - Límite 10 MB; solo imágenes, PDF, txt y zip.
 * - El archivo vive en TICKET_ATTACHMENTS_DIR con un nombre aleatorio y
 *   su hash SHA-256; en BD solo hay metadatos. Nunca se guarda nada en el
 *   repo ni en /tmp como almacenamiento permanente.
 * - Sin TICKET_ATTACHMENTS_DIR la subida se rechaza con un mensaje
 *   honesto. En producción el directorio debe existir además: no se crea
 *   solo. Fuera de producción se crea si hace falta.
 * - La descarga es solo para quien tenga acceso al ticket (cliente dueño
 *   o admin con tickets:reply); un ajeno recibe 404.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Tipo MIME → extensiones aceptadas para ese tipo. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};

export class AttachmentError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extensionOf(fileName: string): string {
  return path.extname(fileName || "").toLowerCase();
}

/**
 * Valida nombre, tipo y tamaño. Devuelve el mensaje de error en español
 * o null si el adjunto es válido.
 */
export function validateAttachment(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  const name = path.basename(input.fileName || "").trim();
  if (!name) return "El archivo no tiene nombre.";
  const mime = (input.mimeType || "").toLowerCase().split(";")[0].trim();
  const allowedExts = ALLOWED_ATTACHMENT_TYPES[mime];
  if (!allowedExts) {
    return "Tipo de archivo no permitido. Solo se aceptan imágenes, PDF, TXT y ZIP.";
  }
  if (!allowedExts.includes(extensionOf(name))) {
    return "La extensión del archivo no coincide con su tipo.";
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "El archivo está vacío.";
  }
  if (input.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return "El archivo supera el límite de 10 MB.";
  }
  return null;
}

/** Directorio de adjuntos según TICKET_ATTACHMENTS_DIR, o null si no está. */
export function attachmentStorageDir(): string | null {
  const dir = (process.env.TICKET_ATTACHMENTS_DIR || "").trim();
  return dir || null;
}

/**
 * Cierto si se puede guardar: variable configurada y, en producción, con
 * el directorio ya existente. Fuera de producción el directorio se crea
 * al guardar.
 */
export function attachmentStorageAvailable(): boolean {
  const dir = attachmentStorageDir();
  if (!dir) return false;
  if (process.env.NODE_ENV === "production") return existsSync(dir);
  return true;
}

export function attachmentStorageUnavailableMessage(): string {
  return "La subida de adjuntos no está configurada en este servidor. No se guardó ningún archivo: contacta con soporte.";
}

/** Ruta del archivo para una clave de almacenamiento; null si es insegura. */
export function attachmentFilePath(storageKey: string): string | null {
  const dir = attachmentStorageDir();
  if (!dir) return null;
  if (!storageKey || storageKey.includes("/") || storageKey.includes("\\") || storageKey.includes("..")) {
    return null;
  }
  return path.join(dir, storageKey);
}

/**
 * Guarda el archivo y su fila en BD. Lanza AttachmentError con el estado
 * HTTP que debe devolver la ruta (400 tipo/tamaño, 503 sin almacén).
 */
export async function saveTicketAttachment(input: {
  ticketId: string;
  messageId?: string | null;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy: string;
}) {
  const invalid = validateAttachment({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
  });
  if (invalid) throw new AttachmentError(invalid, 400);
  const dir = attachmentStorageDir();
  if (!dir || !attachmentStorageAvailable()) {
    throw new AttachmentError(attachmentStorageUnavailableMessage(), 503);
  }
  const mime = input.mimeType.toLowerCase().split(";")[0].trim();
  const storageKey = `${randomUUID()}${extensionOf(input.fileName)}`;
  const filePath = path.join(dir, storageKey);
  if (process.env.NODE_ENV !== "production") {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, input.bytes, { mode: 0o600 });
  const row = await db.ticketAttachment.create({
    data: {
      ticketId: input.ticketId,
      messageId: input.messageId ?? null,
      fileName: path.basename(input.fileName).slice(0, 200),
      mimeType: mime,
      sizeBytes: input.bytes.length,
      sha256: sha256Hex(input.bytes),
      storageKey,
      uploadedBy: input.uploadedBy,
    },
  });
  return row;
}

/** Lee el archivo de un adjunto; null si no está configurado o no existe. */
export async function readTicketAttachment(attachment: {
  storageKey: string;
}): Promise<Buffer | null> {
  const filePath = attachmentFilePath(attachment.storageKey);
  if (!filePath) return null;
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Quién puede ver/descargar un adjunto: el admin con tickets:reply, o el
 * cliente dueño del ticket. Cualquier otro (incluido un admin sin ese
 * permiso) no lo ve: la ruta responde 404, no 403, para no confirmar que
 * el adjunto existe.
 */
export function canAccessTicketAttachment(
  viewer: { adminWithReply: boolean; customerUserId: string | null },
  ticket: { userId: string },
): boolean {
  if (viewer.adminWithReply) return true;
  if (viewer.customerUserId && viewer.customerUserId === ticket.userId) return true;
  return false;
}

export type TicketAttachmentPublic = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
};

/** Vista que sale por la API y se renderiza en el historial del ticket. */
export function publicAttachment(attachment: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): TicketAttachmentPublic {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    downloadUrl: `/api/tickets/attachments/${attachment.id}`,
  };
}
