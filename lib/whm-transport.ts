import "server-only";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  WhmError,
  assertAction,
  isPublicAddress,
  whmBase,
  validateIdentity,
  type WhmAction,
} from "@/lib/whm-security";

export type WhmCredentials = { username: string; token: string };
export type WhmRows = {
  rows: Record<string, string>[];
  total: number;
  truncated: boolean;
};
export const WHM_ROW_LIMIT = 100;
const BODY_LIMIT = 2 * 1024 * 1024;
export async function publicTarget(host: string) {
  const literal = host.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answers = isIP(literal)
      ? [{ address: literal, family: isIP(literal) }]
      : await Promise.race([
          lookup(host, { all: true, verbatim: true }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new WhmError("timeout")), 3000);
          }),
        ]);
    if (!answers.length || answers.some((x) => !isPublicAddress(x.address)))
      throw new WhmError("blocked");
    return answers[0];
  } catch (error) {
    throw error instanceof WhmError ? error : new WhmError("network");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** HTTPS is pinned to one validated DNS answer. No second DNS lookup/rebinding, redirects, proxy or TLS bypass. */
export async function readWhm(
  endpoint: string,
  credentials: WhmCredentials,
  action: WhmAction,
): Promise<WhmRows> {
  assertAction(action);
  const base = whmBase(endpoint);
  validateIdentity(credentials.username, credentials.token);
  if (!credentials.token) throw new WhmError("pending");
  const url = new URL(`/json-api/${action}`, base);
  url.searchParams.set("api.version", "1");
  if (action === "listaccts")
    url.searchParams.set(
      "want",
      "user,domain,plan,suspended,diskused,disklimit",
    );
  if (action === "listpkgs") url.searchParams.set("want", "viewable");
  const target = await publicTarget(url.hostname);
  return new Promise((resolve, reject) => {
    const fail = (code: ConstructorParameters<typeof WhmError>[0]) =>
      reject(new WhmError(code));
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        rejectUnauthorized: true,
        family: target.family,
        headers: {
          Authorization: `whm ${credentials.username}:${credentials.token}`,
          Accept: "application/json",
        },
        // Host header and TLS SNI/certificate identity remain the original hostname.
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
              parseWhmResponse(
                JSON.parse(Buffer.concat(parts).toString("utf8")),
                action,
                credentials.token,
              ),
            );
          } catch (error) {
            reject(
              error instanceof WhmError ? error : new WhmError("response"),
            );
          }
        });
      },
    );
    const timer = setTimeout(() => {
      fail("timeout");
      req.destroy();
    }, 10000);
    req.on("error", () => fail("network"));
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}
export function parseWhmResponse(
  value: unknown,
  action: WhmAction,
  token: string,
): WhmRows {
  assertAction(action);
  if (!value || typeof value !== "object") throw new WhmError("response");
  const body = value as {
    metadata?: { result?: unknown; command?: unknown; version?: unknown };
    data?: Record<string, unknown>;
  };
  if (body.metadata?.result !== 1) throw new WhmError("rejected");
  if (body.metadata.command !== action || body.metadata.version !== 1)
    throw new WhmError("response");
  const entries = body.data?.[action === "listaccts" ? "acct" : "pkg"];
  if (!Array.isArray(entries)) throw new WhmError("response");
  const fields =
    action === "listaccts"
      ? ["user", "domain", "plan", "suspended", "diskused", "disklimit"]
      : ["name", "QUOTA", "BWLIMIT", "MAXPOP", "MAXSQL"];
  const rows = entries.slice(0, WHM_ROW_LIMIT).map((entry) => {
    if (!entry || typeof entry !== "object") throw new WhmError("response");
    return Object.fromEntries(
      fields.map((key) => {
        const value = (entry as Record<string, unknown>)[key];
        const scalar =
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : "—";
        return [
          key,
          (token ? scalar.split(token).join("[oculto]") : scalar)
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 120),
        ];
      }),
    );
  });
  return {
    rows,
    total: entries.length,
    truncated: entries.length > WHM_ROW_LIMIT,
  };
}
