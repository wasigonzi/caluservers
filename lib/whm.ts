import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { whmBase, validateIdentity, WhmError } from "@/lib/whm-security";
import { readWhm, type WhmCredentials } from "@/lib/whm-transport";

export type WhmPublicConfig = {
  url: string;
  username: string;
  hasToken: boolean;
  configured: boolean;
  state: "pending" | "unverified";
};
function key() {
  const value = process.env.SETTINGS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new WhmError("key");
  return Buffer.from(value, "hex");
}
export function encryptWhm(credentials: WhmCredentials) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("caluservers:whm:v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials)),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}
export function decryptWhm(value: string): WhmCredentials {
  try {
    const [version, iv, tag, body, ...rest] = value.split(":");
    if (
      version !== "v1" ||
      rest.length ||
      !/^[a-f0-9]{24}$/.test(iv) ||
      !/^[a-f0-9]{32}$/.test(tag) ||
      !/^(?:[a-f0-9]{2})+$/.test(body)
    )
      throw new WhmError("storage");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "hex"),
    );
    decipher.setAAD(Buffer.from("caluservers:whm:v1"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const credentials = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "hex")),
        decipher.final(),
      ]).toString(),
    );
    if (
      typeof credentials.username !== "string" ||
      typeof credentials.token !== "string"
    )
      throw new WhmError("storage");
    validateIdentity(credentials.username, credentials.token);
    return credentials;
  } catch (error) {
    throw error instanceof WhmError ? error : new WhmError("storage");
  }
}
export function publicWhmConfig(
  endpoint: string,
  credentials: WhmCredentials,
): WhmPublicConfig {
  const configured = Boolean(
    endpoint && credentials.username && credentials.token,
  );
  return {
    url: endpoint,
    username: credentials.username,
    hasToken: Boolean(credentials.token),
    configured,
    state: configured ? "unverified" : "pending",
  };
}
async function storedWhm() {
  return db.integrationConfig.findUnique({ where: { id: "whm" } });
}
export async function whmConfiguration(): Promise<WhmPublicConfig> {
  key(); // Fail closed before accepting credentials if the existing master key is unavailable.
  const row = await storedWhm();
  return row
    ? publicWhmConfig(row.endpoint, decryptWhm(row.encryptedCredentials))
    : {
        url: "",
        username: "",
        hasToken: false,
        configured: false,
        state: "pending",
      };
}
export function mergeWhmInput(
  input: unknown,
  previous?: { endpoint: string; credentials: WhmCredentials },
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WhmError("invalid");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) => !["url", "username", "token"].includes(key),
    ) ||
    typeof value.url !== "string" ||
    value.url.length > 300 ||
    typeof value.username !== "string" ||
    (value.token !== undefined && typeof value.token !== "string")
  )
    throw new WhmError("invalid");
  const endpoint = whmBase(value.url),
    username = value.username.trim();
  const supplied = typeof value.token === "string" ? value.token : "";
  validateIdentity(username, supplied);
  if (
    !supplied &&
    previous?.credentials.token &&
    (previous.endpoint !== endpoint ||
      previous.credentials.username !== username)
  )
    throw new WhmError("identity");
  return {
    endpoint,
    credentials: {
      username,
      token: supplied || previous?.credentials.token || "",
    },
  };
}
export async function saveWhmConfiguration(input: unknown) {
  const previous = await storedWhm();
  const candidate = mergeWhmInput(
    input,
    previous
      ? {
          endpoint: previous.endpoint,
          credentials: decryptWhm(previous.encryptedCredentials),
        }
      : undefined,
  );
  const encryptedCredentials = encryptWhm(candidate.credentials);
  await db.$transaction([
    db.integrationConfig.upsert({
      where: { id: "whm" },
      create: { id: "whm", endpoint: candidate.endpoint, encryptedCredentials },
      update: { endpoint: candidate.endpoint, encryptedCredentials },
    }),
    db.adminAudit.create({
      data: {
        action: "whm.settings.updated",
        details: "WHM read-only settings updated; secrets omitted",
      },
    }),
  ]);
  return publicWhmConfig(candidate.endpoint, candidate.credentials);
}
/** Called only by the admin+Origin guarded POST route, never during public rendering. */
export async function whmRead(
  operation: "test" | "overview" | "listaccts" | "listpkgs",
) {
  if (!["test", "overview", "listaccts", "listpkgs"].includes(operation))
    throw new WhmError("invalid");
  const row = await storedWhm();
  if (!row) throw new WhmError("pending");
  const credentials = decryptWhm(row.encryptedCredentials);
  if (!credentials.token) throw new WhmError("pending");
  if (operation === "listaccts" || operation === "listpkgs")
    return {
      ...(await readWhm(row.endpoint, credentials, operation)),
      operation,
    };
  const accounts = await readWhm(row.endpoint, credentials, "listaccts");
  const packages = await readWhm(row.endpoint, credentials, "listpkgs");
  const checkedAt = new Date().toISOString();
  return operation === "test"
    ? {
        connected: true,
        checkedAt,
        accounts: accounts.total,
        packages: packages.total,
        metadata: { listaccts: 1, listpkgs: 1 },
      }
    : { connected: true, checkedAt, accounts, packages };
}
