import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { DomainQueryError, lookupDomain } from "./domain-lookup";
import { getPluginConfig, getPluginSecrets, isPluginEnabled } from "./plugins";
import { OutboundError, requestJson } from "./outbound";
import type { DomainAvailability, DomainRegistrar } from "./plugin-types";

/**
 * Adaptador Porkbun (API JSON v3) — Fase 3.
 *
 * Documentación oficial (verificada por el coordinador):
 * - https://porkbun.com/api/json/v3/documentation
 * - https://porkbun.com/llms-full.txt (v3.100)
 *
 * Reglas:
 * - Base https://api.porkbun.com/api/json/v3. Auth por cabeceras
 *   X-API-Key / X-Secret-API-Key (preferido). Respuestas con status
 *   SUCCESS/ERROR y code. Las claves nunca se registran ni se incluyen en
 *   mensajes de error.
 * - Sin plugin activo o sin secretos guardados, todo lanza `unconfigured`
 *   (el llamador responde 503): nunca se simula un registro ni un precio.
 * - La disponibilidad la decide RDAP (lib/domain-lookup.ts), fuente neutra;
 *   Porkbun solo aporta el precio. Un fallo de RDAP nunca se presenta
 *   como "libre".
 * - Los precios de venta los decide TldPrice; Porkbun solo re-cotiza en el
 *   momento de registrar/renovar/transferir (el coste enviado es EXACTO al
 *   de checkDomain). Si no hay precio en ningún sitio, el precio queda
 *   ausente: nunca se inventa.
 * - Límite de Porkbun: 1 intento por segundo y un pedido de 100 $ como
 *   máximo. Las escrituras llevan Idempotency-Key (un UUID por intento).
 * - NO hay endpoint para el código EPP de salida ni endpoint verificado
 *   para el auto-renew: getAuthCode lanza `not-supported` y setAutoRenew
 *   es un no-op documentado (el flag local vive en RegisteredDomain).
 * - No se llama a api.porkbun.com en pruebas: el transporte es inyectable
 *   (ver `__setPorkbunFetch`).
 */

export const PORKBUN_BASE = "https://api.porkbun.com/api/json/v3";
export const PORKBUN_MAX_ORDER_CENTS = 10_000; // 100 $ por pedido.

const MESSAGES = {
  unconfigured:
    "Porkbun no está configurado. Activa el plugin y guarda la clave API y la clave secreta.",
  unverified:
    "No se pudo confirmar si el dominio está libre. Inténtalo de nuevo más tarde.",
  "not-supported":
    "Esa operación no la ofrece la API de Porkbun. Se gestiona en el panel de Porkbun.",
  upstream: "Porkbun no completó la operación. No se registró ningún cambio.",
  invalid: "Ese dominio no es válido para Porkbun.",
  unavailable: "Ese dominio ya está registrado.",
  "rate-limited": "Porkbun limitó las consultas. Espera un momento y reintenta.",
} as const;

export type PorkbunErrorCode = keyof typeof MESSAGES;

const HTTP_STATUS: Record<PorkbunErrorCode, number> = {
  unconfigured: 503,
  unverified: 503,
  "not-supported": 501,
  upstream: 502,
  invalid: 400,
  unavailable: 409,
  "rate-limited": 429,
};

export class PorkbunError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: PorkbunErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = "PorkbunError";
    this.httpStatus = HTTP_STATUS[code];
  }
}

export type PorkbunTransport = (options: {
  url: string;
  method: "GET" | "POST";
  allowHosts: readonly string[];
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) => Promise<{ status: number; json: unknown }>;

/** Transporte real por defecto; las pruebas lo sustituyen (sin red real). */
let transport: PorkbunTransport = (options) => requestJson(options);
let transportIsTest = false;

/** Solo para pruebas: sustituye el transporte HTTP por un doble falso. */
export function __setPorkbunFetch(fn: PorkbunTransport): void {
  transport = fn;
  transportIsTest = true;
}

/** Solo para pruebas: restaura el transporte real. */
export function __resetPorkbunFetch(): void {
  transport = (options) => requestJson(options);
  transportIsTest = false;
}

/* ------------------------------ utilidades ------------------------------ */

/** USD en texto ("9.20") a céntimos; null si no es un importe válido. */
export function parseUsdToCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = typeof value === "number" ? value : Number.parseFloat(value.trim());
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Traduce un error de Porkbun a un mensaje honesto en español, sin filtrar
 * el cuerpo crudo. Solo el `code` (si lo hay) se conserva en el mensaje
 * genérico: nunca lleva secretos ni texto remoto sin filtrar.
 */
export function porkbunErrorFromCode(code: unknown): PorkbunError {
  const raw = typeof code === "string" ? code : "";
  const upper = raw.toUpperCase();
  if (
    upper.includes("AUTH") ||
    upper.includes("INVALID_API") ||
    upper.includes("INVALID_CREDENTIAL") ||
    upper.includes("UNAUTHORIZED")
  ) {
    return new PorkbunError(
      "upstream",
      "Las credenciales de Porkbun no son válidas. Revisa la clave API y la clave secreta en el panel de plugins.",
    );
  }
  if (upper.includes("RATE") || upper.includes("TOO_MANY")) {
    return new PorkbunError("rate-limited");
  }
  if (upper.includes("INSUFFICIENT") || upper.includes("BALANCE")) {
    return new PorkbunError(
      "upstream",
      "El saldo de Porkbun no cubre el pedido. Recarga saldo en Porkbun antes de registrar.",
    );
  }
  if (upper.includes("PREMIUM")) {
    return new PorkbunError(
      "invalid",
      "Ese dominio es premium y no se puede registrar por la API de Porkbun.",
    );
  }
  if (upper.includes("TAKEN") || upper.includes("NOT_AVAILABLE") || upper.includes("UNAVAILABLE")) {
    return new PorkbunError("unavailable");
  }
  if (upper.includes("INVALID_DOMAIN") || upper.includes("INVALID") || upper.includes("BAD_REQUEST")) {
    return new PorkbunError("invalid");
  }
  return new PorkbunError(
    "upstream",
    raw
      ? `Porkbun no completó la operación (código ${raw}).`
      : "Porkbun no completó la operación.",
  );
}

/* ------------------------------ credenciales ------------------------------ */

type PorkbunCredentials = { apiKey: string; secretKey: string; mode: "sandbox" | "live" };

async function porkbunCredentials(): Promise<PorkbunCredentials> {
  if (!(await isPluginEnabled("porkbun").catch(() => false))) {
    throw new PorkbunError("unconfigured");
  }
  const secrets = await getPluginSecrets("porkbun").catch(() => null);
  const apiKey = secrets?.apiKey?.trim() ?? "";
  const secretKey = secrets?.secretKey?.trim() ?? "";
  if (!apiKey || !secretKey) throw new PorkbunError("unconfigured");
  const config = await getPluginConfig("porkbun").catch(
    (): Record<string, unknown> => ({}),
  );
  const mode = config.mode === "sandbox" ? "sandbox" : "live";
  return { apiKey, secretKey, mode };
}

/* ------------------------------ llamadas ------------------------------ */

/** Porkbun permite 1 intento por segundo: se respeta solo con el transporte real. */
let lastCallAt = 0;

async function throttle(): Promise<void> {
  if (transportIsTest) return;
  const now = Date.now();
  const wait = 1000 - (now - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

type PorkbunCallOptions = {
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  /** Escrituras: Idempotency-Key, un UUID por intento. */
  idempotencyKey?: string;
};

/**
 * Una llamada a la API v3. Exige credenciales (salvo `pricing/get`, que es
 * pública) y traduce cualquier fallo a PorkbunError.
 */
async function callPorkbun(
  options: PorkbunCallOptions,
  credentials?: PorkbunCredentials | null,
): Promise<Record<string, unknown>> {
  const creds = credentials === undefined ? await porkbunCredentials() : credentials;
  await throttle();
  let result: { status: number; json: unknown };
  try {
    result = await transport({
      url: `${PORKBUN_BASE}${options.path}`,
      method: options.method,
      allowHosts: ["api.porkbun.com"],
      headers: {
        ...(creds
          ? { "X-API-Key": creds.apiKey, "X-Secret-API-Key": creds.secretKey }
          : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeoutMs: 10_000,
    });
  } catch (error) {
    if (error instanceof OutboundError) throw new PorkbunError("upstream");
    throw error;
  }
  const body = asRecord(result.json);
  if (result.status !== 200 || !body || body.status !== "SUCCESS") {
    throw porkbunErrorFromCode(body?.code);
  }
  return body;
}

/** TLD sin punto ("com") para la API; con punto (".com") para la BD. */
function bareTld(tld: string): string {
  return tld.replace(/^\./, "").toLowerCase();
}

export type TldPriceQuote = {
  registerCents: number;
  renewCents: number;
  transferCents: number;
};

/**
 * POST /pricing/get (sin auth). Devuelve los precios en USD de los TLD
 * pedidos y la lista de TLD que Porkbun no vende (`unsupported`).
 */
export async function getPricing(tlds: string[]): Promise<{
  prices: Record<string, TldPriceQuote>;
  unsupported: string[];
}> {
  const bare = [...new Set(tlds.map(bareTld))].filter(Boolean);
  if (!bare.length) return { prices: {}, unsupported: [] };
  const body = await callPorkbun({ path: "/pricing/get", method: "POST", body: { tlds: bare } }, null);
  const pricing = asRecord(body.pricing) ?? {};
  const prices: Record<string, TldPriceQuote> = {};
  for (const [key, value] of Object.entries(pricing)) {
    const entry = asRecord(value);
    if (!entry) continue;
    const registerCents = parseUsdToCents(entry.registration);
    const renewCents = parseUsdToCents(entry.renewal);
    const transferCents = parseUsdToCents(entry.transfer);
    if (registerCents === null || renewCents === null || transferCents === null) continue;
    prices[`.${bareTld(key)}`] = { registerCents, renewCents, transferCents };
  }
  const unsupported = Array.isArray(body.unsupported)
    ? body.unsupported
        .map((item) => (typeof item === "string" ? `.${bareTld(item)}` : null))
        .filter((item): item is string => item !== null)
    : [];
  return { prices, unsupported };
}

type CheckDomainQuote = {
  available: boolean;
  priceCents: number | null;
  renewalCents: number | null;
  transferCents: number | null;
};

/**
 * POST /domain/checkDomain/{domain}. `priceType` es "registration" por
 * defecto; para el precio de renovación se pasa "renewal" (verificado en
 * la documentación). El precio de transferencia no tiene un campo con
 * nombre verificado en el resumen de la documentación: se lee de
 * `additional.transfer.price` y, si no está, de `transferPrice`; si no
 * hay ninguno, queda null y el servicio usa TldPrice.
 */
async function checkDomainQuote(
  domain: string,
  priceType: "registration" | "renewal" = "registration",
): Promise<CheckDomainQuote> {
  const body = await callPorkbun({
    path: `/domain/checkDomain/${encodeURIComponent(domain)}`,
    method: "POST",
    body: priceType === "renewal" ? { priceType: "renewal" } : {},
  });
  const avail = asString(body.avail);
  const additional = asRecord(body.additional) ?? {};
  const renewal = asRecord(additional.renewal) ?? {};
  const transfer = asRecord(additional.transfer) ?? {};
  return {
    available: avail === "yes",
    priceCents: parseUsdToCents(body.price),
    renewalCents: parseUsdToCents(renewal.price),
    transferCents:
      parseUsdToCents(transfer.price) ??
      parseUsdToCents(body.transferPrice) ??
      (typeof body.transfer === "string" ? parseUsdToCents(body.transfer) : null),
  };
}

/* ------------------------------ adaptador ------------------------------ */

export type PorkbunRegisterResult = {
  domain: string;
  expiresAt: Date;
  /** Id del pedido en Porkbun (se guarda como registryId). */
  orderId?: string;
  /** true cuando getDomain no confirmó la fecha y se estimó now + 1 año. */
  expiresAtEstimated?: boolean;
};

export class PorkbunRegistrar implements DomainRegistrar {
  readonly key = "porkbun";

  /** Precios de Porkbun por TLD (mismo formato que POST /pricing/get). */
  async getPricing(tlds: string[]): Promise<{
    prices: Record<string, TldPriceQuote>;
    unsupported: string[];
  }> {
    return getPricing(tlds);
  }

  /**
   * Disponibilidad por RDAP (fuente neutra) + precio de Porkbun si hay
   * credenciales, si no de TldPrice. Sin precio en ningún sitio, el precio
   * queda ausente: nunca se inventa.
   */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    let rdap: Awaited<ReturnType<typeof lookupDomain>>;
    try {
      rdap = await lookupDomain(domain);
    } catch (error) {
      if (error instanceof DomainQueryError) {
        throw new PorkbunError("invalid", error.message);
      }
      throw error;
    }
    if (rdap.state === "registered") {
      return { domain: rdap.domain, available: false };
    }
    if (rdap.state === "unverified") {
      throw new PorkbunError("unverified");
    }
    let priceCents: number | undefined;
    try {
      const quote = await checkDomainQuote(rdap.domain);
      if (quote.available && quote.priceCents !== null) priceCents = quote.priceCents;
    } catch (error) {
      // Sin credenciales o con fallo de Porkbun, el precio sale de TldPrice.
      if (!(error instanceof PorkbunError)) throw error;
    }
    if (priceCents === undefined) {
      const row = await db.tldPrice
        .findUnique({
          where: { tld_registrarKey: { tld: rdap.tld, registrarKey: "porkbun" } },
        })
        .catch(() => null);
      if (row?.active && row.registerCents > 0) priceCents = row.registerCents;
    }
    return {
      domain: rdap.domain,
      available: true,
      ...(priceCents !== undefined ? { priceCents, currency: "USD" } : {}),
    };
  }

  /**
   * POST /domain/create/{domain}. Re-cotiza con checkDomain y exige el
   * coste EXACTO en pennies; registros siempre de duración mínima
   * (normalmente 1 año); premium no registrable por API; pedido ≤ 100 $.
   * Tras crear, confirma expiresAt con getDomain; si eso falla, estima
   * now + 1 año y lo marca (el servicio lo refresca luego).
   */
  async register(input: {
    domain: string;
    years: number;
    registrant: { name: string; email: string; organization?: string; country?: string };
    nameservers?: string[];
  }): Promise<PorkbunRegisterResult> {
    if (input.years !== 1) {
      throw new PorkbunError(
        "invalid",
        "Porkbun registra por la duración mínima (normalmente 1 año); no se piden varios años en una sola llamada.",
      );
    }
    const quote = await checkDomainQuote(input.domain);
    if (!quote.available) throw new PorkbunError("unavailable");
    if (quote.priceCents === null) {
      throw new PorkbunError(
        "upstream",
        "Porkbun no dio precio para ese dominio. No se registró nada.",
      );
    }
    if (quote.priceCents > PORKBUN_MAX_ORDER_CENTS) {
      throw new PorkbunError(
        "invalid",
        "El pedido supera el límite de 100 $ por pedido de Porkbun.",
      );
    }
    const body = await callPorkbun({
      path: `/domain/create/${encodeURIComponent(input.domain)}`,
      method: "POST",
      body: { cost: quote.priceCents, agreeToTerms: "yes" },
      idempotencyKey: randomUUID(),
    });
    const orderId = asString(body.orderId) ?? undefined;
    let expiresAt: Date;
    let expiresAtEstimated = false;
    try {
      const confirmed = await this.getDomain(input.domain);
      if (confirmed.expiresAt) {
        expiresAt = confirmed.expiresAt;
      } else {
        throw new Error("sin fecha de vencimiento");
      }
    } catch {
      const estimated = new Date();
      estimated.setFullYear(estimated.getFullYear() + 1);
      expiresAt = estimated;
      expiresAtEstimated = true;
    }
    return { domain: input.domain, expiresAt, orderId, expiresAtEstimated };
  }

  /**
   * POST /domain/transfer/{domain}. Asíncrona (5–7 días); .uk y premium
   * no van por API. El coste es el exacto de checkDomain o, si Porkbun no
   * lo da, el de TldPrice.
   */
  async transfer(input: {
    domain: string;
    authCode: string;
    years?: number;
  }): Promise<{ domain: string; status: string }> {
    const authCode = input.authCode.trim();
    if (!authCode) {
      throw new PorkbunError("invalid", "Falta el código de autorización (EPP) de la transferencia.");
    }
    if (input.domain.toLowerCase().endsWith(".uk")) {
      throw new PorkbunError(
        "not-supported",
        "Los dominios .uk no se transfieren por la API de Porkbun.",
      );
    }
    let cost: number | null = null;
    try {
      const quote = await checkDomainQuote(input.domain);
      cost = quote.transferCents;
    } catch (error) {
      if (!(error instanceof PorkbunError)) throw error;
    }
    if (cost === null) {
      const tld = `.${input.domain.split(".").pop() ?? ""}`;
      const row = await db.tldPrice
        .findUnique({
          where: { tld_registrarKey: { tld, registrarKey: "porkbun" } },
        })
        .catch(() => null);
      if (row?.active && row.transferCents > 0) cost = row.transferCents;
    }
    if (cost === null) {
      throw new PorkbunError(
        "upstream",
        "Porkbun no dio el precio de transferencia para ese dominio. No se inició nada.",
      );
    }
    if (cost > PORKBUN_MAX_ORDER_CENTS) {
      throw new PorkbunError(
        "invalid",
        "El pedido supera el límite de 100 $ por pedido de Porkbun.",
      );
    }
    await callPorkbun({
      path: `/domain/transfer/${encodeURIComponent(input.domain)}`,
      method: "POST",
      body: { authCode, cost },
      idempotencyKey: randomUUID(),
    });
    return { domain: input.domain, status: "pending_transfer" };
  }

  /**
   * POST /domain/renew/{domain}. El coste es el precio de renovación de
   * checkDomain con priceType=renewal. Renovación de un año por llamada;
   * las renovaciones premium no van por API. No renovar un dominio
   * registrado/renovado en los últimos 30 días es una guarda del servicio
   * (lib/domains.ts), no del adaptador: aquí no se conoce esa fecha.
   */
  async renew(domain: string, years: number): Promise<PorkbunRegisterResult> {
    if (years !== 1) {
      throw new PorkbunError(
        "invalid",
        "La renovación por API es de un año por llamada.",
      );
    }
    const quote = await checkDomainQuote(domain, "renewal");
    const cost = quote.renewalCents ?? quote.priceCents;
    if (cost === null) {
      throw new PorkbunError(
        "upstream",
        "Porkbun no dio el precio de renovación para ese dominio. No se renovó nada.",
      );
    }
    if (cost > PORKBUN_MAX_ORDER_CENTS) {
      throw new PorkbunError(
        "invalid",
        "El pedido supera el límite de 100 $ por pedido de Porkbun.",
      );
    }
    const body = await callPorkbun({
      path: `/domain/renew/${encodeURIComponent(domain)}`,
      method: "POST",
      body: { cost },
      idempotencyKey: randomUUID(),
    });
    const orderId = asString(body.orderId) ?? undefined;
    let expiresAt: Date;
    let expiresAtEstimated = false;
    try {
      const confirmed = await this.getDomain(domain);
      if (confirmed.expiresAt) {
        expiresAt = confirmed.expiresAt;
      } else {
        throw new Error("sin fecha de vencimiento");
      }
    } catch {
      const estimated = new Date();
      estimated.setFullYear(estimated.getFullYear() + 1);
      expiresAt = estimated;
      expiresAtEstimated = true;
    }
    return { domain, expiresAt, orderId, expiresAtEstimated };
  }

  /**
   * GET /domain/get/{domain} + GET /domain/getNs/{domain}.
   *
   * Nota honesta: el resumen verificado de la documentación confirma los
   * campos (status, expiración, autoRenew, apiAccess, securityLock) pero
   * no su nombre JSON exacto. Se leen de forma defensiva (`expiration`,
   * `expiresAt`, `expiry`; `ns` o `nameservers`): la primera prueba en
   * sandbox debe confirmar el formato exacto (ver docs/DOMINIOS.md).
   */
  async getDomain(domain: string): Promise<{
    domain: string;
    status: string;
    expiresAt: Date | null;
    autoRenew: boolean;
    nameservers: string[];
  }> {
    const body = await callPorkbun({
      path: `/domain/get/${encodeURIComponent(domain)}`,
      method: "GET",
    });
    const data = asRecord(body.domain) ?? body;
    const rawStatus = asString(data.status);
    const status =
      rawStatus && rawStatus !== "SUCCESS" && rawStatus !== "ERROR"
        ? rawStatus
        : "unknown";
    const expiresAt =
      parseDate(data.expiration) ?? parseDate(data.expiresAt) ?? parseDate(data.expiry);
    const autoRenew = data.autoRenew === true || data.autoRenew === "yes";
    let nameservers: string[] = [];
    try {
      const nsBody = await callPorkbun({
        path: `/domain/getNs/${encodeURIComponent(domain)}`,
        method: "GET",
      });
      const nsData = asRecord(nsBody.ns) ?? nsBody;
      const list = Array.isArray(nsBody.ns)
        ? nsBody.ns
        : Array.isArray(nsData.nameservers)
          ? nsData.nameservers
          : [];
      nameservers = list.filter((item): item is string => typeof item === "string");
    } catch {
      // Sin nameservers no se bloquea la lectura del dominio.
      nameservers = [];
    }
    return { domain, status, expiresAt, autoRenew, nameservers };
  }

  /**
   * NO VERIFICADO en la documentación oficial: no hay endpoint confirmado
   * para el auto-renew en Porkbun. Este método NO toca Porkbun a
   * propósito: el auto-renew es solo el flag local `RegisteredDomain.
   * autoRenew`, que persiste el servicio (lib/domains.ts). El auto-renew
   * de Porkbun se gestiona en su panel.
   */
  async setAutoRenew(_domain: string, _enabled: boolean): Promise<void> {
    return;
  }

  /**
   * POST /domain/updateNs/{domain}. Los nameservers se tratan como
   * conjunto sin orden. El campo del cuerpo es `ns` según la
   * documentación oficial; la primera prueba en sandbox debe confirmarlo
   * (ver docs/DOMINIOS.md).
   */
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    const cleaned = [...new Set(nameservers.map((ns) => ns.trim().toLowerCase()))].filter(
      Boolean,
    );
    if (!cleaned.length || cleaned.length > 13) {
      throw new PorkbunError("invalid", "Indica entre 1 y 13 servidores de nombres.");
    }
    const hostRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
    if (!cleaned.every((ns) => hostRe.test(ns) && ns.length <= 253)) {
      throw new PorkbunError("invalid", "Uno de los servidores de nombres no es válido.");
    }
    await callPorkbun({
      path: `/domain/updateNs/${encodeURIComponent(domain)}`,
      method: "POST",
      body: { ns: cleaned },
      idempotencyKey: randomUUID(),
    });
  }

  /**
   * NO existe endpoint para obtener el código EPP de salida: el código se
   * obtiene en el panel de Porkbun. Lanza `not-supported` (501) honesto.
   */
  async getAuthCode(_domain: string): Promise<string> {
    throw new PorkbunError(
      "not-supported",
      "Porkbun no ofrece el código de autorización (EPP) por API: se obtiene en el panel de Porkbun.",
    );
  }
}

export const porkbunRegistrar = new PorkbunRegistrar();

/** Adaptador por clave. Hoy solo existe Porkbun; GoDaddy es solo manifiesto. */
export function getRegistrar(key = "porkbun"): PorkbunRegistrar {
  if (key !== "porkbun") {
    throw new PorkbunError(
      "not-supported",
      `El registrador "${key}" aún no tiene adaptador. Solo Porkbun está implementado.`,
    );
  }
  return porkbunRegistrar;
}
