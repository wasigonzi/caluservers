/**
 * Validación pura de subidas de branding (logos, favicon, OG).
 * Sin dependencias de Node crypto para poder probarse en node:test.
 */

export type BrandingSlot =
  | "logoUrl"
  | "logoMobileUrl"
  | "faviconUrl"
  | "ogImageUrl";

export const BRANDING_SLOTS: BrandingSlot[] = [
  "logoUrl",
  "logoMobileUrl",
  "faviconUrl",
  "ogImageUrl",
];

export const MAX_FAVICON_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type DetectedImage = {
  mime: string;
  ext: string;
};

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

/** Detecta tipo por magic bytes. SVG/HTML → null (rechazo). */
export function detectImageMagic(bytes: Uint8Array): DetectedImage | null {
  if (!bytes.length) return null;
  // SVG / HTML / XML activos
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, 256); i += 1) {
    head += String.fromCharCode(bytes[i]);
  }
  head = head.trimStart().toLowerCase();
  if (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<!doctype") ||
    head.startsWith("<html")
  ) {
    return null;
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { mime: "image/gif", ext: "gif" };
  }
  // WEBP: RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  // ICO
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return { mime: "image/x-icon", ext: "ico" };
  }
  return null;
}

export function isBrandingSlot(value: string): value is BrandingSlot {
  return (BRANDING_SLOTS as string[]).includes(value);
}

export function maxBytesForSlot(slot: BrandingSlot): number {
  return slot === "faviconUrl" ? MAX_FAVICON_BYTES : MAX_IMAGE_BYTES;
}

export function allowedMimesForSlot(slot: BrandingSlot): string[] {
  if (slot === "faviconUrl") {
    return ["image/png", "image/x-icon", "image/vnd.microsoft.icon"];
  }
  return ["image/png", "image/jpeg", "image/webp", "image/gif"];
}

export function acceptAttrForSlot(slot: BrandingSlot): string {
  if (slot === "faviconUrl") return "image/png,image/x-icon,.ico";
  return "image/png,image/jpeg,image/webp,image/gif";
}

/**
 * Valida buffer + slot. Devuelve tipo detectado o mensaje de error.
 * La extensión se deriva del contenido, no de file.name.
 */
export function validateBrandingBytes(
  slot: BrandingSlot,
  bytes: Uint8Array,
): { ok: true; detected: DetectedImage } | { ok: false; error: string } {
  const max = maxBytesForSlot(slot);
  if (!bytes.byteLength) return { ok: false, error: "Archivo vacío." };
  if (bytes.byteLength > max) {
    return {
      ok: false,
      error: `El archivo supera el límite de ${Math.round(max / (1024 * 1024))} MB para este campo.`,
    };
  }
  const detected = detectImageMagic(bytes);
  if (!detected) {
    return {
      ok: false,
      error:
        "Formato no permitido. SVG y HTML están bloqueados. Usa PNG, JPEG, WebP o GIF; favicon: PNG o ICO.",
    };
  }
  const allowed = allowedMimesForSlot(slot);
  const mimeOk =
    allowed.includes(detected.mime) ||
    (slot === "faviconUrl" &&
      (detected.mime === "image/x-icon" || detected.mime === "image/png"));
  if (!mimeOk) {
    if (slot === "faviconUrl") {
      return {
        ok: false,
        error: "Favicon: solo PNG o ICO (detectado por contenido).",
      };
    }
    return {
      ok: false,
      error: `Tipo ${detected.mime} no permitido para este campo.`,
    };
  }
  return { ok: true, detected };
}

export function isBlobConfiguredEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
}

export function randomBrandingPathname(
  slot: BrandingSlot,
  ext: string,
  randomPart: string,
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return `branding/${slot}/${randomPart}.${safeExt}`;
}

/**
 * Checks bytes for every upload path, including the client-upload callback.
 * Invalid bytes are deleted. A passing double is not a live Blob connection.
 */
export async function reviewUploadedBranding(input: {
  slot: string;
  bytes: Uint8Array;
  url: string;
  remove: (url: string) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isBrandingSlot(input.slot)) {
    await input.remove(input.url);
    return { ok: false, error: "Slot de branding inválido." };
  }
  const checked = validateBrandingBytes(input.slot, input.bytes);
  if (!checked.ok) {
    await input.remove(input.url);
    return checked;
  }
  return { ok: true };
}

export function isVercelBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".public.blob.vercel-storage.com") ||
        u.hostname.endsWith(".blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}
