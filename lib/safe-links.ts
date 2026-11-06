/** Validación de enlaces seguros: solo https (o http en vacíos internos), rutas internas allowlist, sin javascript:. */

export const INTERNAL_PATHS = [
  "/",
  "/web-hosting",
  "/vps",
  "/dedicated",
  "/domains",
  "/about",
  "/contact",
  "/client",
  "/abuse",
  "/terms",
  "/privacy",
  "/aup",
] as const;

export type InternalPath = (typeof INTERNAL_PATHS)[number];

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isInternalPath(value: string): value is InternalPath {
  return (INTERNAL_PATHS as readonly string[]).includes(value);
}

/** https absoluto, o vacío. Rechaza javascript:, data:, etc. */
export function isHttpsUrl(value: string, { allowEmpty = true } = {}): boolean {
  const v = value.trim();
  if (!v) return allowEmpty;
  if (/^(javascript|data|vbscript|file):/i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Ruta interna, "whmcs", o https. */
export function isSafeHref(value: string, { allowEmpty = false } = {}): boolean {
  const v = value.trim();
  if (!v) return allowEmpty;
  if (v === "whmcs") return true;
  if (isInternalPath(v)) return true;
  return isHttpsUrl(v, { allowEmpty: false });
}

export function resolveHref(value: string, whmcs: string): string {
  const v = value.trim();
  if (v === "whmcs") return whmcs;
  return v;
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

/** Texto plano: sin tags HTML. */
export function isPlainText(value: string, max = 500): boolean {
  if (value.length > max) return false;
  return !/[<>]/.test(value);
}
