import { domainToASCII } from "node:url";

/**
 * Normalización de nombres de dominio sin red: la usan tanto la consulta RDAP
 * como el pedido (el dominio que el cliente declara para su hosting).
 */

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class DomainNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainNameError";
  }
}

/**
 * Devuelve el dominio en ASCII (punycode si hace falta) o lanza `DomainNameError`.
 * Acepta `midominio.com`; rechaza rutas, espacios, credenciales y subdominios
 * cuando `allowSubdomain` es falso.
 */
export function normalizeDomainName(
  raw: string,
  { allowSubdomain = false }: { allowSubdomain?: boolean } = {},
): string {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[./]+$/, "");
  if (!cleaned || cleaned.length > 253 || /[\s/?#@:_]/.test(cleaned)) {
    throw new DomainNameError("Escribe un dominio como midominio.com.");
  }
  const labels = cleaned.split(".");
  if (labels.length < 2) {
    throw new DomainNameError("Falta la extensión del dominio (por ejemplo .com).");
  }
  if (labels.length > 2 && !allowSubdomain) {
    throw new DomainNameError("Usa el dominio principal, sin subdominios.");
  }
  const ascii = labels.map((label) => {
    const converted = domainToASCII(label);
    if (!converted || converted.length > 63 || !LABEL_RE.test(converted)) {
      throw new DomainNameError("Ese nombre tiene caracteres que no se pueden registrar.");
    }
    return converted;
  });
  const tld = ascii[ascii.length - 1];
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    throw new DomainNameError("La extensión del dominio no es válida.");
  }
  return ascii.join(".");
}
