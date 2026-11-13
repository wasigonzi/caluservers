import "server-only";
import { db } from "@/lib/db";
import { openSecret, sealSecret, SecretBoxError } from "@/lib/secret-box";
import { whmBase, validateIdentity, WhmError } from "@/lib/whm-security";
import { readWhm, type WhmCredentials } from "@/lib/whm-transport";

/** AAD propio de las credenciales de SOLO LECTURA. */
const WHM_AAD = "caluservers:whm:v1";

export type WhmPublicConfig = {
  url: string;
  username: string;
  hasToken: boolean;
  configured: boolean;
  state: "pending" | "unverified";
};
/** Falla cerrado si la clave maestra existente no está disponible. */
function key() {
  const value = process.env.SETTINGS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new WhmError("key");
  return Buffer.from(value, "hex");
}
export function encryptWhm(credentials: WhmCredentials) {
  try {
    return sealSecret(WHM_AAD, JSON.stringify(credentials));
  } catch (error) {
    throw error instanceof SecretBoxError ? new WhmError("key") : error;
  }
}
export function decryptWhm(value: string): WhmCredentials {
  try {
    const credentials = JSON.parse(openSecret(WHM_AAD, value));
    if (
      typeof credentials.username !== "string" ||
      typeof credentials.token !== "string"
    )
      throw new WhmError("storage");
    validateIdentity(credentials.username, credentials.token);
    return credentials;
  } catch (error) {
    if (error instanceof WhmError) throw error;
    throw new WhmError(
      error instanceof SecretBoxError && error.code === "key" ? "key" : "storage",
    );
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
