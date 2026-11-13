import "server-only";
import { randomUUID } from "node:crypto";
import { OutboundError, requestJson } from "./outbound";

/**
 * PayPal Orders API v2. Cobro real de las facturas propias.
 *
 * - Credenciales solo por entorno (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
 *   `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID`). Sin ellas, las rutas responden 503:
 *   no existe un modo de prueba que simule un cobro.
 * - El importe se construye desde los céntimos de la factura, nunca desde el cliente.
 * - La firma del webhook se verifica contra PayPal antes de registrar nada.
 * - Las llamadas salen por el cliente endurecido: host fijo, IP pública, TLS verificado.
 */

export type PaypalEnv = "sandbox" | "live";

const HOSTS: Record<PaypalEnv, string> = {
  sandbox: "api-m.sandbox.paypal.com",
  live: "api-m.paypal.com",
};

/** PayPal no acepta decimales en estas monedas; el resto de la app trabaja en céntimos. */
const ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);

const MESSAGES = {
  unconfigured:
    "El cobro con PayPal no está configurado. Faltan las credenciales de la pasarela.",
  currency:
    "La moneda configurada no es compatible con el importe en céntimos de esta app.",
  upstream: "PayPal no completó la operación. No se registró ningún cobro.",
  mismatch: "El importe o la referencia de PayPal no coinciden con la factura.",
  signature: "La notificación no superó la verificación de firma de PayPal.",
} as const;

export class PaypalError extends Error {
  constructor(readonly code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = "PaypalError";
  }
}

export function paypalEnv(): PaypalEnv | null {
  const value = (process.env.PAYPAL_ENV || "").trim().toLowerCase();
  return value === "live" || value === "sandbox" ? value : null;
}

export function paypalConfig() {
  const env = paypalEnv();
  const clientId = (process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();
  if (!env || clientId.length < 20 || clientSecret.length < 20) return null;
  return { env, clientId, clientSecret, host: HOSTS[env] };
}

export function paypalReady(): boolean {
  return paypalConfig() !== null;
}

export function paypalWebhookId(): string {
  return (process.env.PAYPAL_WEBHOOK_ID || "").trim();
}

export function paypalWebhookReady(): boolean {
  return paypalReady() && paypalWebhookId().length >= 10;
}

/** Céntimos → importe PayPal. Falla antes de enviar si la moneda no lleva decimales. */
export function paypalAmount(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new PaypalError("mismatch");
  if (ZERO_DECIMAL.has(currency.toUpperCase())) throw new PaypalError("currency");
  return (cents / 100).toFixed(2);
}

/** Importe PayPal → céntimos, para comparar con la factura sin confiar en el texto. */
export function centsFromAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

type Token = { value: string; expiresAt: number };
let cachedToken: Token | null = null;

/** Solo para pruebas: olvida el token guardado. */
export function resetPaypalToken() {
  cachedToken = null;
}

async function accessToken(): Promise<string> {
  const config = paypalConfig();
  if (!config) throw new PaypalError("unconfigured");
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const result = await requestJson({
    url: `https://${config.host}/v1/oauth2/token`,
    method: "POST",
    allowHosts: [config.host],
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    timeoutMs: 10000,
  });
  const payload = result.json as { access_token?: unknown; expires_in?: unknown } | null;
  if (result.status !== 200 || typeof payload?.access_token !== "string") {
    throw new PaypalError("upstream");
  }
  const ttl = typeof payload.expires_in === "number" ? payload.expires_in : 300;
  cachedToken = {
    value: payload.access_token,
    // Un minuto de margen para no usar un token que caduca en vuelo.
    expiresAt: now + Math.max(30, ttl - 60) * 1000,
  };
  return cachedToken.value;
}

async function api(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  extraHeaders?: Record<string, string>,
) {
  const config = paypalConfig();
  if (!config) throw new PaypalError("unconfigured");
  const token = await accessToken();
  try {
    return await requestJson({
      url: `https://${config.host}${path}`,
      method,
      allowHosts: [config.host],
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs: 15000,
    });
  } catch (error) {
    throw error instanceof OutboundError ? new PaypalError("upstream") : error;
  }
}

export type PaypalOrder = { id: string; status: string; approveUrl: string };

function approveLink(payload: unknown): string {
  const links = (payload as { links?: unknown } | null)?.links;
  if (!Array.isArray(links)) return "";
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const rel = (link as { rel?: unknown }).rel;
    const href = (link as { href?: unknown }).href;
    if (
      (rel === "payer-action" || rel === "approve") &&
      typeof href === "string" &&
      /^https:\/\/(?:www\.)?(?:sandbox\.)?paypal\.com\//.test(href)
    ) {
      return href;
    }
  }
  return "";
}

/**
 * Crea la orden en PayPal. `invoiceNumber` viaja como `invoice_id`, que PayPal
 * exige único por cuenta: un segundo intento de la misma factura se rechaza arriba.
 */
export async function createPaypalOrder(input: {
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  brandName: string;
}): Promise<PaypalOrder> {
  const value = paypalAmount(input.amountCents, input.currency);
  const result = await api(
    "/v2/checkout/orders",
    "POST",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.invoiceId,
          custom_id: input.invoiceId,
          invoice_id: input.invoiceNumber,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName.slice(0, 127),
            locale: "es-ES",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    { "PayPal-Request-Id": `order-${input.invoiceId}` },
  );
  const payload = result.json as { id?: unknown; status?: unknown } | null;
  const approveUrl = approveLink(result.json);
  if (
    (result.status !== 200 && result.status !== 201) ||
    typeof payload?.id !== "string" ||
    !approveUrl
  ) {
    throw new PaypalError("upstream");
  }
  return {
    id: payload.id,
    status: typeof payload.status === "string" ? payload.status : "CREATED",
    approveUrl,
  };
}

export type PaypalCapture = {
  captureId: string;
  status: string;
  amountCents: number;
  currency: string;
  invoiceId: string;
};

/** Extrae la captura de una respuesta de PayPal (orden capturada o evento de webhook). */
export function readCapture(payload: unknown): PaypalCapture | null {
  if (!payload || typeof payload !== "object") return null;
  const units = (payload as { purchase_units?: unknown }).purchase_units;
  if (!Array.isArray(units) || !units.length) return null;
  const unit = units[0];
  if (!unit || typeof unit !== "object") return null;
  const invoiceId = (unit as { custom_id?: unknown }).custom_id;
  const payments = (unit as { payments?: unknown }).payments;
  const captures = (payments as { captures?: unknown } | null)?.captures;
  if (!Array.isArray(captures) || !captures.length) return null;
  const capture = captures.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { status?: unknown }).status === "COMPLETED",
  );
  if (!capture || typeof capture !== "object") return null;
  const id = (capture as { id?: unknown }).id;
  const amount = (capture as { amount?: unknown }).amount;
  const cents = centsFromAmount((amount as { value?: unknown } | null)?.value);
  const currency = (amount as { currency_code?: unknown } | null)?.currency_code;
  if (
    typeof id !== "string" ||
    typeof invoiceId !== "string" ||
    typeof currency !== "string" ||
    cents === null
  ) {
    return null;
  }
  return {
    captureId: id,
    status: "COMPLETED",
    amountCents: cents,
    currency: currency.toUpperCase(),
    invoiceId,
  };
}

/** Captura la orden aprobada. Idempotente por `PayPal-Request-Id`. */
export async function capturePaypalOrder(orderId: string): Promise<PaypalCapture> {
  if (!/^[A-Z0-9]{5,32}$/i.test(orderId)) throw new PaypalError("mismatch");
  const result = await api(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    "POST",
    {},
    { "PayPal-Request-Id": `capture-${orderId}` },
  );
  // 422 con ORDER_ALREADY_CAPTURED: la orden ya se cobró, se lee su estado.
  if (result.status === 422) {
    const existing = await paypalOrderCapture(orderId);
    if (existing) return existing;
    throw new PaypalError("upstream");
  }
  if (result.status !== 200 && result.status !== 201) throw new PaypalError("upstream");
  const capture = readCapture(result.json);
  if (!capture) throw new PaypalError("upstream");
  return capture;
}

/** Relee una orden para recuperar una captura ya hecha. */
export async function paypalOrderCapture(orderId: string): Promise<PaypalCapture | null> {
  if (!/^[A-Z0-9]{5,32}$/i.test(orderId)) throw new PaypalError("mismatch");
  const result = await api(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, "GET");
  if (result.status !== 200) return null;
  return readCapture(result.json);
}

export type WebhookHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

export function readWebhookHeaders(headers: { get(name: string): string | null }): WebhookHeaders | null {
  const authAlgo = headers.get("paypal-auth-algo") || "";
  const certUrl = headers.get("paypal-cert-url") || "";
  const transmissionId = headers.get("paypal-transmission-id") || "";
  const transmissionSig = headers.get("paypal-transmission-sig") || "";
  const transmissionTime = headers.get("paypal-transmission-time") || "";
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return null;
  }
  // El certificado solo puede venir de PayPal, aunque la verificación la haga PayPal.
  let host = "";
  try {
    const url = new URL(certUrl);
    if (url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host !== "paypal.com" && !host.endsWith(".paypal.com")) return null;
  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime };
}

/**
 * Verifica la firma del webhook contra PayPal. Sin `PAYPAL_WEBHOOK_ID` no se
 * acepta ningún evento: un webhook sin verificar no registra cobros.
 */
export async function verifyWebhook(input: {
  headers: WebhookHeaders;
  event: unknown;
}): Promise<boolean> {
  const webhookId = paypalWebhookId();
  if (!paypalWebhookReady()) throw new PaypalError("unconfigured");
  const result = await api("/v1/notifications/verify-webhook-signature", "POST", {
    auth_algo: input.headers.authAlgo,
    cert_url: input.headers.certUrl,
    transmission_id: input.headers.transmissionId,
    transmission_sig: input.headers.transmissionSig,
    transmission_time: input.headers.transmissionTime,
    webhook_id: webhookId,
    webhook_event: input.event,
  });
  const payload = result.json as { verification_status?: unknown } | null;
  return result.status === 200 && payload?.verification_status === "SUCCESS";
}

/** Identificador de petición para trazas; no se envía a PayPal salvo donde se indica. */
export function requestId(): string {
  return randomUUID();
}
