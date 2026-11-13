import "server-only";
import { TLDS } from "./catalog";
import { DomainNameError, normalizeDomainName } from "./domain-name";
import { OutboundError, requestJson } from "./outbound";

/**
 * Disponibilidad de dominios por RDAP (RFC 7480/9082). Sin credenciales ni API de pago.
 *
 * El servidor autoritativo se descubre con el arranque oficial de IANA
 * (https://data.iana.org/rdap/dns.json) y la consulta va directa a ese servidor.
 *
 * Reglas:
 * - 404 del registro = libre. 200 = registrado.
 * - Cualquier otra cosa (límite, caída, plazo agotado) es "sin confirmar".
 *   Nunca se declara un dominio libre por un fallo de red.
 * - Solo se consultan las extensiones que vende este sitio: no es un proxy RDAP abierto.
 */

const IANA_HOST = "data.iana.org";
const BOOTSTRAP_URL = `https://${IANA_HOST}/rdap/dns.json`;
const BOOTSTRAP_TTL_MS = 12 * 60 * 60 * 1000;

export type DomainState = "available" | "registered" | "unverified";

export type DomainResult = {
  domain: string;
  tld: string;
  state: DomainState;
  /** Motivo cuando el estado es "unverified". Texto fijo, nunca el error remoto. */
  reason?: "no-bootstrap" | "no-server" | "rate-limited" | "unreachable" | "bad-response";
  checkedAt: string;
};

export class DomainQueryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DomainQueryError";
  }
}

/** Extensiones soportadas, en minúsculas y con punto. */
export function supportedTlds(): string[] {
  return TLDS.map((tld) => tld.toLowerCase());
}

/**
 * Acepta "midominio.com" o "midominio" (con la extensión aparte) y devuelve
 * el nombre en ASCII. Rechaza rutas, espacios, subdominios y extensiones ajenas.
 */
export function normalizeDomain(rawName: string, rawTld?: string): { domain: string; tld: string } {
  const cleaned = String(rawName ?? "").trim().toLowerCase().replace(/[./]+$/, "");
  const tlds = supportedTlds();
  const requested = rawTld ? String(rawTld).trim().toLowerCase() : "";
  const hasTld = tlds.some((tld) => cleaned.endsWith(tld));
  // "midominio" + extensión elegida en los chips se completa antes de validar.
  const candidate = hasTld
    ? cleaned
    : tlds.includes(requested)
      ? `${cleaned}${requested}`
      : cleaned;
  let domain: string;
  try {
    domain = normalizeDomainName(candidate);
  } catch (error) {
    throw new DomainQueryError(
      error instanceof DomainNameError ? error.message : "Dominio no válido.",
      400,
    );
  }
  const tld = tlds.find((item) => domain.endsWith(item)) ?? "";
  if (!tld) {
    throw new DomainQueryError(
      `Extensión no soportada aquí. Disponibles: ${tlds.join(", ")}.`,
      400,
    );
  }
  return { domain, tld };
}

type Bootstrap = { map: Map<string, string>; fetchedAt: number };
let cachedBootstrap: Bootstrap | null = null;

/** Solo para pruebas: olvida el arranque guardado. */
export function resetBootstrapCache() {
  cachedBootstrap = null;
}

function parseBootstrap(payload: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!payload || typeof payload !== "object") return map;
  const services = (payload as { services?: unknown }).services;
  if (!Array.isArray(services)) return map;
  for (const service of services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const [zones, urls] = service;
    if (!Array.isArray(zones) || !Array.isArray(urls)) continue;
    const base = urls.find(
      (url): url is string => typeof url === "string" && url.startsWith("https://"),
    );
    if (!base) continue;
    for (const zone of zones) {
      if (typeof zone !== "string" || !zone) continue;
      const key = `.${zone.toLowerCase().replace(/^\./, "")}`;
      if (!map.has(key)) map.set(key, base.endsWith("/") ? base : `${base}/`);
    }
  }
  return map;
}

async function bootstrap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedBootstrap && now - cachedBootstrap.fetchedAt < BOOTSTRAP_TTL_MS) {
    return cachedBootstrap.map;
  }
  const result = await requestJson({
    url: BOOTSTRAP_URL,
    method: "GET",
    allowHosts: [IANA_HOST],
    timeoutMs: 6000,
    bodyLimit: 1024 * 1024,
  });
  if (result.status !== 200) throw new OutboundError("response");
  const map = parseBootstrap(result.json);
  if (!map.size) throw new OutboundError("response");
  cachedBootstrap = { map, fetchedAt: now };
  return map;
}

function unverified(
  domain: string,
  tld: string,
  reason: NonNullable<DomainResult["reason"]>,
): DomainResult {
  return { domain, tld, state: "unverified", reason, checkedAt: new Date().toISOString() };
}

/** Interpreta el código RDAP. 404 es la señal normal de "libre". */
export function stateFromStatus(
  status: number,
): "available" | "registered" | NonNullable<DomainResult["reason"]> {
  if (status === 404) return "available";
  if (status === 200) return "registered";
  if (status === 429) return "rate-limited";
  return "bad-response";
}

export async function lookupDomain(rawName: string, rawTld?: string): Promise<DomainResult> {
  const { domain, tld } = normalizeDomain(rawName, rawTld);

  let servers: Map<string, string>;
  try {
    servers = await bootstrap();
  } catch {
    return unverified(domain, tld, "no-bootstrap");
  }
  const base = servers.get(tld);
  if (!base) return unverified(domain, tld, "no-server");

  let host: string;
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return unverified(domain, tld, "no-server");
  }

  try {
    const result = await requestJson({
      url: `${base}domain/${encodeURIComponent(domain)}`,
      method: "GET",
      allowHosts: [host],
      headers: { Accept: "application/rdap+json, application/json" },
      timeoutMs: 8000,
      bodyLimit: 256 * 1024,
    });
    const outcome = stateFromStatus(result.status);
    if (outcome === "available" || outcome === "registered") {
      return { domain, tld, state: outcome, checkedAt: new Date().toISOString() };
    }
    return unverified(domain, tld, outcome);
  } catch {
    // Plazo agotado, DNS fuera de rango público o red caída: no se afirma nada.
    return unverified(domain, tld, "unreachable");
  }
}
