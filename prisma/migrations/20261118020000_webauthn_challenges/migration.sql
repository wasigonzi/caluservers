-- Fase 1, tramo C: WebAuthn/Passkeys + MFA.
--
-- Tablas nuevas:
-- - WebauthnChallenge: retos de un solo uso del administrador, en BD con
--   expiración corta (en serverless la memoria del proceso no vale: cada
--   instancia vería solo sus retos). `ownerKey` es el ownerId del admin
--   (id de AdminUser o `env:<correo>`, ver lib/webauthn.ts).
-- - passkey: almacén propio del plugin oficial `@better-auth/passkey`
--   (1.7.18) para las passkeys de CLIENTE. Sus campos son los que exige el
--   plugin; no es PasskeyCredential (que es solo del admin).
-- - twoFactor: almacén propio del plugin two-factor de better-auth para el
--   TOTP opcional del cliente (secreto + códigos de respaldo).
-- Columna nueva: User.twoFactorEnabled (false por defecto; solo se exige
-- 2FA al cliente que lo activa y verifica).
-- Aditiva: no toca ninguna tabla existente ni borra datos.

CREATE TABLE "WebauthnChallenge" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebauthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebauthnChallenge_challenge_key" ON "WebauthnChallenge"("challenge");
CREATE INDEX "WebauthnChallenge_purpose_ownerKey_idx" ON "WebauthnChallenge"("purpose", "ownerKey");

CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aaguid" TEXT,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkey_credentialID_key" ON "passkey"("credentialID");
CREATE INDEX "passkey_userId_idx" ON "passkey"("userId");

ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "twoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");

ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
