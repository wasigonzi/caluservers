import "server-only";
import { isIP } from "node:net";

export const WHM_ACTIONS = ["listaccts", "listpkgs"] as const;
export type WhmAction = (typeof WHM_ACTIONS)[number];
const MESSAGES = {
  invalid:
    "Configura un servidor HTTPS en el puerto 2087, usuario WHM y token válido.",
  blocked:
    "El servidor debe resolver únicamente a direcciones IP públicas permitidas.",
  pending: "Pendiente configuración: faltan servidor, usuario o token WHM.",
  key: "El almacenamiento cifrado no está disponible. Contacta al administrador de la aplicación.",
  storage:
    "No se pudo acceder a la configuración guardada. No se ha conectado al servidor.",
  identity:
    "Para cambiar servidor o usuario, vuelve a introducir el token; no se trasladará el token guardado.",
  network:
    "No se pudo conectar por HTTPS a WHM. Revisa DNS, firewall, puerto 2087 y certificado TLS.",
  timeout: "La lectura WHM superó el tiempo permitido. No se reintentó.",
  rejected:
    "WHM rechazó la lectura. Revisa token y permisos list-accts / list-pkgs.",
  response:
    "WHM devolvió una respuesta inválida o demasiado grande; no se consideró conexión exitosa.",
} as const;
export class WhmError extends Error {
  constructor(public readonly code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = "WhmError";
  }
}
export function safeWhmError(error: unknown) {
  return error instanceof WhmError && Object.prototype.hasOwnProperty.call(MESSAGES, error.code)
    ? { code: error.code, message: MESSAGES[error.code] }
    : { code: "storage", message: MESSAGES.storage };
}
export function assertAction(value: string): asserts value is WhmAction {
  if (!(WHM_ACTIONS as readonly string[]).includes(value))
    throw new WhmError("invalid");
}
export function isPublicAddress(raw: string): boolean {
  const family = isIP(raw);
  if (family === 4) {
    const [a, b, c] = raw.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family !== 6 || raw.includes(".") || raw.includes("%")) return false;
  const [left, right] = raw.toLowerCase().split("::");
  const l = left ? left.split(":") : [],
    r = right ? right.split(":") : [];
  const words =
    right === undefined
      ? l
      : [...l, ...Array(8 - l.length - r.length).fill("0"), ...r];
  const first = parseInt(words[0], 16),
    second = parseInt(words[1], 16);
  // Fail closed outside global unicast, including mapped/NAT64, local, transition and documentation space.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
    !(first === 0x3fff && second < 0x1000)
  );
}
export function whmBase(raw: string): string {
  const value = raw.trim();
  const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (
    !authority ||
    /:443$/.test(authority) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    throw new WhmError("invalid");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WhmError("invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (url.port && url.port !== "2087")
  )
    throw new WhmError("invalid");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new WhmError("blocked");
  } else if (
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      host,
    ) ||
    /\.(?:localhost|local|internal|test|invalid|example)$/i.test(host)
  )
    throw new WhmError("invalid");
  url.port = "2087";
  return url.origin;
}
export function validateIdentity(username: string, token: string) {
  if (
    !/^[a-zA-Z0-9_]{1,32}$/.test(username) ||
    (token && !/^[a-zA-Z0-9._~-]{16,512}$/.test(token))
  )
    throw new WhmError("invalid");
}
