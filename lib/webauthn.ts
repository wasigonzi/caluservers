import "server-only";
import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db } from "@/lib/db";

/**
 * WebAuthn/passkeys SOLO de administrador (Fase 1, tramo C).
 *
 * Las passkeys de cliente viven en el almacén propio del plugin
 * oficial `@better-auth/passkey` (tabla `passkey`, ver lib/customer-auth.ts),
 * no en PasskeyCredential: no se duplica el protocolo a mano en ningún lado.
 *
 * Retos: de un solo uso y guardados EN BD (tabla WebauthnChallenge), con
 * expiración corta. La memoria del proceso NO vale en serverless: cada
 * instancia vería solo sus retos y un reto podría reutilizarse en otra.
 * El consumo es un `deleteMany` con la guarda de expiración: atómico, el
 * segundo intento con el mismo reto ya no encuentra fila.
 *
 * RP: WEBAUTHN_RP_ID (por defecto, el host de BETTER_AUTH_URL sin esquema),
 * WEBAUTHN_RP_NAME (por defecto CaluServers) y WEBAUTHN_ORIGIN (por
 * defecto BETTER_AUTH_URL). El RP ID definitivo es el dominio de
 * producción; en local es `localhost`.
 */

export function webauthnRpId(): string {
  const raw = (process.env.WEBAUTHN_RP_ID || "").trim();
  if (raw) return raw;
  const base = (process.env.BETTER_AUTH_URL || "").trim();
  if (base) {
    try {
      return new URL(base).hostname;
    } catch {
      return "localhost";
    }
  }
  return "localhost";
}

export function webauthnRpName(): string {
  return (process.env.WEBAUTHN_RP_NAME || "").trim() || "CaluServers";
}

export function webauthnOrigin(): string {
  const raw = (process.env.WEBAUTHN_ORIGIN || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  const base = (process.env.BETTER_AUTH_URL || "").trim();
  if (base) return base.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** Los retos viven 5 minutos: más que el timeout de la ceremonia (60 s). */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = "register" | "authenticate";

export interface ChallengeStore {
  save(purpose: ChallengePurpose, ownerKey: string, challenge: string, expiresAt: Date): Promise<void>;
  /** true solo la primera vez y solo si el reto no caducó. */
  consume(purpose: ChallengePurpose, ownerKey: string, challenge: string): Promise<boolean>;
}

export const dbChallengeStore: ChallengeStore = {
  async save(purpose, ownerKey, challenge, expiresAt) {
    await db.webauthnChallenge.create({
      data: { purpose, ownerKey, challenge, expiresAt },
    });
  },
  async consume(purpose, ownerKey, challenge) {
    const deleted = await db.webauthnChallenge.deleteMany({
      where: { purpose, ownerKey, challenge, expiresAt: { gt: new Date() } },
    });
    return deleted.count === 1;
  },
};

/** Almacén en memoria, solo para pruebas (nunca en producción). */
export function memoryChallengeStore(): ChallengeStore & { size(): number } {
  const rows = new Map<string, { expiresAt: number }>();
  const key = (purpose: ChallengePurpose, ownerKey: string, challenge: string) =>
    `${purpose}:${ownerKey}:${challenge}`;
  return {
    async save(purpose, ownerKey, challenge, expiresAt) {
      rows.set(key(purpose, ownerKey, challenge), { expiresAt: expiresAt.getTime() });
    },
    async consume(purpose, ownerKey, challenge) {
      const row = rows.get(key(purpose, ownerKey, challenge));
      if (!row) return false;
      rows.delete(key(purpose, ownerKey, challenge));
      return row.expiresAt > Date.now();
    },
    size() {
      return rows.size;
    },
  };
}

export async function issueChallenge(
  store: ChallengeStore,
  purpose: ChallengePurpose,
  ownerKey: string,
  challenge: string,
  ttlMs = CHALLENGE_TTL_MS,
): Promise<void> {
  await store.save(purpose, ownerKey, challenge, new Date(Date.now() + ttlMs));
}

export async function consumeChallenge(
  store: ChallengeStore,
  purpose: ChallengePurpose,
  ownerKey: string,
  challenge: string,
): Promise<boolean> {
  return store.consume(purpose, ownerKey, challenge);
}

/**
 * Regla del contador (anti-clonación): el contador del autenticador debe
 * avanzar en cada uso. Un autenticador sin contador devuelve siempre 0
 * (guardado 0, nuevo 0: se acepta). Si el contador desaparece (guardado > 0,
 * nuevo 0) o no avanza, se rechaza: posible credencial clonada.
 */
export function counterAdvances(storedCounter: number, newCounter: number): boolean {
  if (newCounter === 0) return storedCounter === 0;
  return newCounter > storedCounter;
}

/**
 * Clave estable del propietario en PasskeyCredential. Con AdminUser es su
 * id; el admin por entorno (sin fila en BD) usa `env:<correo>`. La misma
 * clave se usa para los retos y para los códigos de recuperación.
 */
export async function adminOwnerId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  try {
    const user = await db.adminUser.findFirst({
      where: { email: normalized },
      select: { id: true },
    });
    if (user) return user.id;
  } catch {
    // Sin BD no hay AdminUser: cae al identificador por entorno.
  }
  return `env:${normalized}`;
}

function serializeTransports(transports?: readonly string[]): string | null {
  if (!transports || transports.length === 0) return null;
  return JSON.stringify(transports);
}

function parseTransports(raw: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as AuthenticatorTransportFuture[];
  } catch {
    // Formato heredado separado por comas.
  }
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? (parts as AuthenticatorTransportFuture[]) : undefined;
}

/**
 * `userID` (user handle) estable de 32 bytes: el hash del ownerId. Un
 * correo largo como `env:<correo>` no cabe en los 64 bytes del handle.
 */
function adminUserHandle(ownerId: string): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256").update(ownerId).digest();
  const handle = new Uint8Array(32);
  handle.set(digest);
  return handle;
}

export type AdminIdentity = { email: string };

export async function adminRegistrationOptions(
  admin: AdminIdentity,
  store: ChallengeStore = dbChallengeStore,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const ownerId = await adminOwnerId(admin.email);
  const existing = await db.passkeyCredential.findMany({
    where: { ownerType: "admin", ownerId },
    select: { credentialId: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: webauthnRpName(),
    rpID: webauthnRpId(),
    userName: admin.email,
    userID: adminUserHandle(ownerId),
    userDisplayName: admin.email,
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: parseTransports(credential.transports),
    })),
  });
  await issueChallenge(store, "register", ownerId, options.challenge);
  return options;
}

export async function verifyAdminRegistration(
  admin: AdminIdentity,
  response: RegistrationResponseJSON,
  store: ChallengeStore = dbChallengeStore,
): Promise<{ verified: boolean; credentialId?: string }> {
  const ownerId = await adminOwnerId(admin.email);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      // El reto se consume aquí mismo: un solo uso, y si la verificación
      // falla después, el reto ya no vale para reintentarlo.
      expectedChallenge: async (challenge) =>
        consumeChallenge(store, "register", ownerId, challenge),
      expectedOrigin: webauthnOrigin(),
      expectedRPID: webauthnRpId(),
      // UV "preferred" en el registro: exigirla aquí rechazaría llaves
      // sin PIN. La verificación del usuario la decide el autenticador.
      requireUserVerification: false,
    });
  } catch {
    return { verified: false };
  }
  if (!verification.verified || !verification.registrationInfo) return { verified: false };
  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKey = isoBase64URL.fromBuffer(credential.publicKey);
  const counter = credential.counter;
  // Una credencial ya registrada por otro propietario no se puede robar
  // con un re-registro: el alta se niega.
  const taken = await db.passkeyCredential.findUnique({ where: { credentialId } });
  if (taken && (taken.ownerType !== "admin" || taken.ownerId !== ownerId)) {
    return { verified: false };
  }
  await db.passkeyCredential.upsert({
    where: { credentialId },
    create: {
      ownerType: "admin",
      ownerId,
      credentialId,
      publicKey,
      counter,
      transports: serializeTransports(credential.transports),
      lastUsedAt: new Date(),
    },
    update: {
      publicKey,
      counter,
      transports: serializeTransports(credential.transports),
      lastUsedAt: new Date(),
    },
  });
  return { verified: true, credentialId };
}

export async function adminAuthenticationOptions(
  email: string,
  store: ChallengeStore = dbChallengeStore,
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const ownerId = await adminOwnerId(email);
  const credentials = await db.passkeyCredential.findMany({
    where: { ownerType: "admin", ownerId },
    select: { credentialId: true, transports: true },
  });
  if (credentials.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: webauthnRpId(),
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: parseTransports(credential.transports),
    })),
    userVerification: "preferred",
  });
  await issueChallenge(store, "authenticate", ownerId, options.challenge);
  return options;
}

export async function verifyAdminAuthentication(
  email: string,
  response: AuthenticationResponseJSON,
  store: ChallengeStore = dbChallengeStore,
): Promise<{ verified: boolean; credentialId?: string; reason?: string }> {
  const ownerId = await adminOwnerId(email);
  const credential = await db.passkeyCredential.findUnique({
    where: { credentialId: response.id },
  });
  if (!credential || credential.ownerType !== "admin" || credential.ownerId !== ownerId) {
    return { verified: false, reason: "unknown-credential" };
  }
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (challenge) =>
        consumeChallenge(store, "authenticate", ownerId, challenge),
      expectedOrigin: webauthnOrigin(),
      expectedRPID: webauthnRpId(),
      credential: {
        id: credential.credentialId,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: parseTransports(credential.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    return { verified: false, reason: "invalid-response" };
  }
  if (!verification.verified) return { verified: false, reason: "invalid-response" };
  const newCounter = verification.authenticationInfo.newCounter;
  if (!counterAdvances(credential.counter, newCounter)) {
    // Contador que no avanza (o que desaparece): posible clonación. No se
    // actualiza el contador y no se crea sesión.
    return { verified: false, reason: "counter" };
  }
  await db.passkeyCredential.update({
    where: { id: credential.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });
  return { verified: true, credentialId: credential.credentialId };
}
