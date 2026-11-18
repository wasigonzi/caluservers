import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { openSecret, sealSecret } from "./secret-box";
import { verifyTotp } from "./totp";

/**
 * MFA de administrador (Fase 1, tramo C): TOTP propio por cuenta y códigos
 * de recuperación de un solo uso.
 *
 * - El TOTP por cuenta vive en AdminUser.totpSecretEncrypted, cifrado con
 *   AES-256-GCM (secret-box) y AAD `admin-totp:<ownerId>`. El secreto del
 *   entorno (ADMIN_TOTP_SECRET) sigue como fallback para el admin que aún
 *   no migró; el login prefiere el de la cuenta (ver
 *   app/api/admin/login/route.ts).
 * - Los códigos de recuperación solo se guardan como hash SHA-256 en
 *   RecoveryCode y se muestran UNA sola vez al generarlos. Cada código
 *   vale hasta que se usa (`usedAt`); regenerar invalida los no usados.
 */

export const RECOVERY_CODE_COUNT = 10;

/** Alfabeto sin caracteres ambiguos (sin 0/O/1/I). */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let code = "";
    const bytes = randomBytes(8);
    for (const byte of bytes) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    codes.add(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return [...codes];
}

/** Hash SHA-256 en hex: es lo único que se guarda de un código. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

export function totpOtpAuthUrl(issuer: string, account: string, secret: string): string {
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
    `?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=6&period=30`
  );
}

/**
 * Puerta del enrolamiento TOTP: el secreto solo se guarda si el código
 * que da el administrador verifica contra ese secreto (ventana ±1).
 */
export function verifyEnrolmentCode(secret: string, code: string, nowMs = Date.now()): boolean {
  return verifyTotp(secret, code, nowMs);
}

export type RecoveryCodeRow = { codeHash: string; usedAt: Date | null };

/**
 * Busca un código sin usar entre las filas del propietario. Puro (sin BD):
 * el llamador marca `usedAt` en BD con la guarda `usedAt IS NULL` para que
 * el consumo sea atómico y de un solo uso.
 */
export function findUnusedRecoveryCode(
  rows: RecoveryCodeRow[],
  code: string,
): RecoveryCodeRow | null {
  const hash = hashRecoveryCode(code);
  const row = rows.find((candidate) => candidate.codeHash === hash);
  if (!row || row.usedAt) return null;
  return row;
}

/** AAD del secreto TOTP de una cuenta de administrador. */
export function adminTotpAad(ownerId: string): string {
  return `admin-totp:${ownerId}`;
}

/**
 * Secreto TOTP de la cuenta de administrador, descifrado, o null si la
 * cuenta no tiene uno enrolado (o el cifrado no abre). Nunca lanza: un
 * secreto corrupto se trata como "sin TOTP" y el login cae al camino del
 * entorno, sin bloquear la cuenta.
 */
export async function adminTotpSecret(ownerId: string): Promise<string | null> {
  try {
    const user = await db.adminUser.findUnique({
      where: { id: ownerId },
      select: { totpSecretEncrypted: true },
    });
    const sealed = user?.totpSecretEncrypted;
    if (!sealed) return null;
    return openSecret(adminTotpAad(ownerId), sealed);
  } catch {
    return null;
  }
}

/** Cifra un secreto TOTP para guardarlo en AdminUser.totpSecretEncrypted. */
export function sealAdminTotpSecret(ownerId: string, secret: string): string {
  return sealSecret(adminTotpAad(ownerId), secret);
}

/**
 * Consume un código de recuperación del administrador: true solo la
 * primera vez. El `updateMany` con `usedAt: null` hace atómico el consumo:
 * dos consumos concurrentes del mismo código solo dejan pasar uno.
 */
export async function verifyAdminRecoveryCode(ownerId: string, code: string): Promise<boolean> {
  let rows: RecoveryCodeRow[];
  try {
    rows = await db.recoveryCode.findMany({
      where: { ownerType: "admin", ownerId },
      select: { codeHash: true, usedAt: true },
    });
  } catch {
    return false;
  }
  const row = findUnusedRecoveryCode(rows, code);
  if (!row) return false;
  try {
    const updated = await db.recoveryCode.updateMany({
      where: { codeHash: row.codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1;
  } catch {
    return false;
  }
}
