import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpAt(secret: Buffer, nowMs: number, step = 30, digits = 6): string {
  return hotp(secret, Math.floor(nowMs / 1000 / step), digits);
}

export type TotpConfig = "off" | "ready" | "invalid" | "required-but-missing";

/**
 * ADMIN_MFA_REQUIRED=true exige MFA al administrador. Solo acepta el valor
 * literal "true" (sin distinguir mayúsculas); cualquier otro valor es "no".
 */
export function adminMfaRequired(raw: string | undefined): boolean {
  return (raw || "").trim().toLowerCase() === "true";
}

export function totpConfig(raw: string | undefined, required = false): TotpConfig {
  const value = (raw || "").trim();
  if (!value) return required ? "required-but-missing" : "off";
  const decoded = base32Decode(value);
  if (!decoded || decoded.length < 10) return "invalid";
  return "ready";
}

/**
 * Fase 1, tramo C: true si el propietario tiene al menos una passkey
 * enrolada en PasskeyCredential (admin) o, en general, en la tabla del
 * tramo B. `ownerType` es "admin" o "client" y `ownerId` el id del
 * AdminUser/User (para el admin por entorno, `env:<correo>`, ver
 * lib/webauthn.ts `adminOwnerId`). Sin BD no se puede afirmar nada: se
 * devuelve false y el login sigue el camino TOTP (fail-closed para el
 * bloqueo de MFA, que exige un método enrolado).
 */
export async function hasPasskeyEnrolled(ownerType: string, ownerId: string): Promise<boolean> {
  try {
    const count = await db.passkeyCredential.count({ where: { ownerType, ownerId } });
    return count > 0;
  } catch {
    return false;
  }
}

export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): boolean {
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length < 10) return false;
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(nowMs / 1000 / 30);
  const given = Buffer.from(normalized);
  let ok = false;
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + delta));
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}
