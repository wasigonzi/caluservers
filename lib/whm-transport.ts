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

import { parseWhmManagement, packageName } from "@/lib/whm-management-schema";

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
  return requestWhmPayload(url, credentials, "GET", undefined, (value) =>
    parseWhmResponse(value, action, credentials.token),
  );
}
/** Internal transport, never exposed as a proxy or accepting client endpoints. */
async function requestWhmPayload<T>(
  url: URL,
  credentials: WhmCredentials,
  method: "GET" | "POST",
  body: string | undefined,
  parse: (value: unknown) => T,
): Promise<T> {
  const target = await publicTarget(url.hostname);
  return new Promise((resolve, reject) => {
    const fail = (code: ConstructorParameters<typeof WhmError>[0]) =>
      reject(new WhmError(code));
    const req = request(
      url,
      {
        method,
        agent: false,
        rejectUnauthorized: true,
        family: target.family,
        headers: {
          Authorization: `whm ${credentials.username}:${credentials.token}`,
          Accept: "application/json",
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": String(Buffer.byteLength(body)),
              }),
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
            resolve(parse(JSON.parse(Buffer.concat(parts).toString("utf8"))));
          } catch (error) {
            reject(
              error instanceof WhmError ? error : new WhmError("response"),
            );
          }
        });
      },
    );
    const timer = setTimeout(
      () => {
        fail("timeout");
        req.destroy();
      },
      method === "POST" ? 45000 : 10000,
    );
    req.on("error", () => fail("network"));
    req.on("close", () => clearTimeout(timer));
    req.end(body);
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

function whmMetadata(value: unknown, action: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new WhmError("response");
  const data = value as {
    metadata?: { result?: unknown; command?: unknown; version?: unknown };
    data?: Record<string, unknown>;
  };
  if (data.metadata?.result !== 1) throw new WhmError("rejected");
  if (data.metadata.command !== action || data.metadata.version !== 1)
    throw new WhmError("response");
  return data.data || {};
}
/** Preserve all unrelated package options. Unknown extensions/settings fail closed rather than reset them. */
export function preservedPackageSettings(
  value: unknown,
): Record<string, string> {
  const data = whmMetadata(value, "getpkginfo"),
    pkg = data.pkg;
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg))
    throw new WhmError("response");
  const row = pkg as Record<string, unknown>;
  const keys: Record<string, string> = {
    BWLIMIT: "bwlimit",
    QUOTA: "quota",
    MAXPOP: "maxpop",
    MAXSQL: "maxsql",
    CGI: "cgi",
    CPMOD: "cpmod",
    DIGESTAUTH: "digestauth",
    FEATURELIST: "featurelist",
    HASSHELL: "hasshell",
    IP: "ip",
    LANG: "language",
    MAXADDON: "maxaddon",
    MAXFTP: "maxftp",
    MAXLST: "maxlst",
    MAXPARK: "maxpark",
    MAXSUB: "maxsub",
    MAX_DEFER_FAIL_PERCENTAGE: "max_defer_fail_percentage",
    MAX_EMAILACCT_QUOTA: "max_emailacct_quota",
    MAX_EMAIL_PER_HOUR: "max_email_per_hour",
    MAX_TEAM_USERS: "max_team_users",
  };
  if (
    (row._PACKAGE_EXTENSIONS !== undefined && row._PACKAGE_EXTENSIONS !== "") ||
    Object.keys(row).some(
      (key) =>
        !Object.hasOwn(keys, key) &&
        key !== "_PACKAGE_EXTENSIONS" &&
        key !== "FRONTPAGE",
    ) ||
    [
      "CPMOD",
      "FEATURELIST",
      "LANG",
      "HASSHELL",
      "IP",
      "CGI",
      "DIGESTAUTH",
    ].some((key) => row[key] === undefined)
  )
    throw new WhmError("package_advanced");
  const result: Record<string, string> = {};
  for (const [source, target] of Object.entries(keys)) {
    if (row[source] === undefined) continue;
    const value = row[source];
    if (
      value === null ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      !["string", "number"].includes(typeof value) ||
      String(value).length > 128 ||
      /[\u0000-\u001f\u007f]/.test(String(value))
    )
      throw new WhmError("package_advanced");
    result[target] = String(value);
  }
  if (
    !["0", "1"].includes(result.cgi) ||
    !["0", "1"].includes(result.hasshell) ||
    !["0", "1", "y", "n"].includes(result.ip) ||
    !["0", "1", "y", "n"].includes(result.digestauth)
  )
    throw new WhmError("package_advanced");
  result.ip = ["1", "y"].includes(result.ip) ? "y" : "n";
  result.digestauth = ["1", "y"].includes(result.digestauth) ? "1" : "0";
  return result;
}
export async function writeWhm(
  endpoint: string,
  credentials: WhmCredentials,
  input: unknown,
): Promise<{ ok: true }> {
  const parsed = parseWhmManagement(input),
    base = whmBase(endpoint);
  validateIdentity(credentials.username, credentials.token);
  if (!credentials.token) throw new WhmError("pending");
  let preserved: Record<string, string> = {};
  if (parsed.action === "editpkg") {
    const url = new URL("/json-api/getpkginfo", base);
    url.searchParams.set("api.version", "1");
    url.searchParams.set("pkg", packageName(parsed.target));
    preserved = await requestWhmPayload(
      url,
      credentials,
      "GET",
      undefined,
      preservedPackageSettings,
    );
  }
  const url = new URL(`/json-api/${parsed.action}`, base);
  const body = new URLSearchParams({
    "api.version": "1",
    ...preserved,
    ...parsed.params,
  }).toString();
  try {
    return await requestWhmPayload(url, credentials, "POST", body, (value) => {
      whmMetadata(value, parsed.action);
      return { ok: true as const };
    });
  } catch (error) {
    if (
      error instanceof WhmError &&
      ["rejected", "blocked", "invalid"].includes(error.code)
    )
      throw error;
    throw new WhmError("uncertain");
  }
}
