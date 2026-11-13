import "server-only";
import { request } from "node:https";
import {
  WhmError,
  isPublicAddress,
  validateIdentity,
  whmBase,
} from "@/lib/whm-security";
import { publicTarget, type WhmCredentials } from "@/lib/whm-transport";

/**
 * Transporte WHM de ESCRITURA, separado del de lectura a propósito.
 *
 * `readWhm` sigue rechazando cualquier comando que modifique el servidor: esa
 * garantía no se toca. Las altas pasan por aquí, con su propia lista de comandos,
 * sus propias credenciales (token con ACL `createacct`) y el mismo endurecimiento
 * de red: https, puerto 2087, DNS público, conexión fijada, TLS verificado,
 * sin redirecciones, con plazo y tamaño máximo.
 */

export const WHM_WRITE_ACTIONS = ["createacct"] as const;
export type WhmWriteAction = (typeof WHM_WRITE_ACTIONS)[number];

const BODY_LIMIT = 512 * 1024;
const REQUEST_TIMEOUT_MS = 25000;

export function assertWriteAction(value: string): asserts value is WhmWriteAction {
  if (!(WHM_WRITE_ACTIONS as readonly string[]).includes(value)) {
    throw new WhmError("invalid");
  }
}

export type WhmWriteResult = {
  /** Mensaje del servidor ya saneado: sin token, sin saltos de línea, acotado. */
  statusmsg: string;
  /** Usuario cPanel creado, si el servidor lo devolvió. */
  user: string;
};

/** Extrae el resultado de `createacct` exigiendo metadata correcta, como en lectura. */
export function parseWriteResponse(
  value: unknown,
  action: WhmWriteAction,
  token: string,
): WhmWriteResult {
  assertWriteAction(action);
  if (!value || typeof value !== "object") throw new WhmError("response");
  const body = value as {
    metadata?: { result?: unknown; command?: unknown; version?: unknown; reason?: unknown };
    data?: unknown;
  };
  const clean = (input: unknown) =>
    (typeof input === "string" || typeof input === "number"
      ? (token ? String(input).split(token).join("[oculto]") : String(input))
      : "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 200);

  if (body.metadata?.command !== action || body.metadata.version !== 1) {
    throw new WhmError("response");
  }
  if (body.metadata.result !== 1) {
    // El motivo remoto se descarta: no se publica texto del servidor como error propio.
    throw new WhmError("rejected");
  }
  const data = body.data as Record<string, unknown> | undefined;
  const options = (data?.options ?? {}) as Record<string, unknown>;
  return {
    statusmsg: clean(body.metadata.reason) || "Cuenta creada.",
    user: clean(options.username ?? data?.user ?? ""),
  };
}

/**
 * Ejecuta un comando de escritura en WHM. Un fallo no se reintenta solo:
 * el reintento lo decide el administrador desde el panel.
 */
export async function writeWhm(
  endpoint: string,
  credentials: WhmCredentials,
  action: WhmWriteAction,
  params: Record<string, string>,
): Promise<WhmWriteResult> {
  assertWriteAction(action);
  const base = whmBase(endpoint);
  validateIdentity(credentials.username, credentials.token);
  if (!credentials.token) throw new WhmError("pending");

  const form = new URLSearchParams({ "api.version": "1" });
  for (const [name, value] of Object.entries(params)) {
    if (!/^[a-z_][a-z0-9_]{0,40}$/i.test(name)) throw new WhmError("invalid");
    if (typeof value !== "string" || value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new WhmError("invalid");
    }
    form.set(name, value);
  }
  const payload = Buffer.from(form.toString(), "utf8");
  const url = new URL(`/json-api/${action}`, base);
  const target = await publicTarget(url.hostname);
  if (!isPublicAddress(target.address)) throw new WhmError("blocked");

  return new Promise<WhmWriteResult>((resolve, reject) => {
    const fail = (code: ConstructorParameters<typeof WhmError>[0]) =>
      reject(new WhmError(code));
    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        rejectUnauthorized: true,
        family: target.family,
        headers: {
          Authorization: `whm ${credentials.username}:${credentials.token}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": String(payload.length),
        },
        lookup: (_host, _options, callback) =>
          callback(null, target.address, target.family),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status !== 200) {
          res.destroy();
          fail(status === 401 || status === 403 ? "rejected" : "network");
          return;
        }
        const parts: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > BODY_LIMIT) {
            res.destroy();
            req.destroy();
            fail("response");
            return;
          }
          parts.push(chunk);
        });
        res.on("error", () => fail("network"));
        res.on("end", () => {
          try {
            resolve(
              parseWriteResponse(
                JSON.parse(Buffer.concat(parts).toString("utf8")),
                action,
                credentials.token,
              ),
            );
          } catch (error) {
            reject(error instanceof WhmError ? error : new WhmError("response"));
          }
        });
      },
    );
    const timer = setTimeout(() => {
      fail("timeout");
      req.destroy();
    }, REQUEST_TIMEOUT_MS);
    req.on("error", () => fail("network"));
    req.on("close", () => clearTimeout(timer));
    req.write(payload);
    req.end();
  });
}
