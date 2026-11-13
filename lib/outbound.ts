import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { isPublicAddress } from "./whm-security";

/**
 * Cliente HTTPS de salida para servicios públicos fijos (RDAP, PayPal).
 *
 * Mismas reglas que el transporte WHM: solo https, host en una lista explícita,
 * DNS resuelto a direcciones públicas, conexión fijada a la dirección validada
 * (sin segunda resolución ni rebinding), sin redirecciones automáticas,
 * sin bypass de TLS, con plazo y tamaño máximo de respuesta.
 */

const CODES = [
  "invalid",
  "blocked",
  "network",
  "timeout",
  "response",
] as const;
export type OutboundCode = (typeof CODES)[number];

export class OutboundError extends Error {
  constructor(readonly code: OutboundCode) {
    super(`outbound:${code}`);
    this.name = "OutboundError";
  }
}

export type OutboundResult = {
  status: number;
  /** JSON ya analizado, o null si el cuerpo no era JSON válido. */
  json: unknown;
};

export type OutboundRequest = {
  url: string;
  method: "GET" | "POST";
  /** Hosts exactos permitidos. Obligatorio: no se sale a un host arbitrario. */
  allowHosts: readonly string[];
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  bodyLimit?: number;
};

const DNS_TIMEOUT_MS = 3000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_BODY_LIMIT = 512 * 1024;

export function assertOutboundUrl(raw: string, allowHosts: readonly string[]): URL {
  if (typeof raw !== "string" || raw.length > 2000 || /[\u0000- \u007f\\]/.test(raw)) {
    throw new OutboundError("invalid");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundError("invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new OutboundError("invalid");
  }
  if (!allowHosts.length || !allowHosts.includes(url.hostname.toLowerCase())) {
    throw new OutboundError("blocked");
  }
  return url;
}

/** Resuelve y exige direcciones públicas. Devuelve la que se usará en la conexión. */
export async function pinnedTarget(host: string) {
  const literal = host.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answers = isIP(literal)
      ? [{ address: literal, family: isIP(literal) }]
      : await Promise.race([
          lookup(host, { all: true, verbatim: true }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new OutboundError("timeout")), DNS_TIMEOUT_MS);
          }),
        ]);
    if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) {
      throw new OutboundError("blocked");
    }
    return answers[0];
  } catch (error) {
    throw error instanceof OutboundError ? error : new OutboundError("network");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requestJson(options: OutboundRequest): Promise<OutboundResult> {
  const url = assertOutboundUrl(options.url, options.allowHosts);
  const limit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const target = await pinnedTarget(url.hostname);
  const payload = options.body ? Buffer.from(options.body, "utf8") : null;

  return new Promise<OutboundResult>((resolve, reject) => {
    const fail = (code: OutboundCode) => reject(new OutboundError(code));
    const req = request(
      url,
      {
        method: options.method,
        agent: false,
        rejectUnauthorized: true,
        family: target.family,
        headers: {
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(payload.length),
              }
            : {}),
          ...options.headers,
        },
        // El Host y la identidad TLS siguen siendo el hostname original.
        lookup: (_host, _opts, callback) => callback(null, target.address, target.family),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // Una redirección no se sigue: se devuelve para que decida quien llama.
        const parts: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > limit) {
            res.destroy();
            req.destroy();
            fail("response");
            return;
          }
          parts.push(chunk);
        });
        res.on("error", () => fail("network"));
        res.on("end", () => {
          const text = Buffer.concat(parts).toString("utf8");
          let json: unknown = null;
          if (text.trim()) {
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
          }
          resolve({ status, json });
        });
      },
    );
    const timer = setTimeout(() => {
      fail("timeout");
      req.destroy();
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    req.on("error", () => fail("network"));
    req.on("close", () => clearTimeout(timer));
    if (payload) req.write(payload);
    req.end();
  });
}
