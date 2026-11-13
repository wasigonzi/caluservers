import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Caja de secretos AES-256-GCM con la clave maestra ya existente
 * (`SETTINGS_ENCRYPTION_KEY`, 64 hex). Formato en base: `v1:iv:tag:cuerpo`.
 *
 * El AAD distingue cada uso: un ciphertext de WHM de lectura no se puede
 * reutilizar como credencial de escritura, aunque alguien mueva la fila.
 */

export type SecretBoxCode = "key" | "data";

export class SecretBoxError extends Error {
  constructor(readonly code: SecretBoxCode) {
    super(`secret-box:${code}`);
    this.name = "SecretBoxError";
  }
}

function masterKey(): Buffer {
  const value = process.env.SETTINGS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new SecretBoxError("key");
  return Buffer.from(value, "hex");
}

export function sealSecret(aad: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function openSecret(aad: string, value: string): string {
  const [version, iv, tag, body, ...rest] = String(value ?? "").split(":");
  if (
    version !== "v1" ||
    rest.length ||
    !/^[a-f0-9]{24}$/.test(iv ?? "") ||
    !/^[a-f0-9]{32}$/.test(tag ?? "") ||
    !/^(?:[a-f0-9]{2})+$/.test(body ?? "")
  ) {
    throw new SecretBoxError("data");
  }
  const key = masterKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Etiqueta inválida, AAD distinto o clave cambiada: no se distingue a propósito.
    throw new SecretBoxError("data");
  }
}
