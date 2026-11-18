import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import { db } from "./db";
import { deliverAuthLink, RESET_MAIL_UNAVAILABLE_MESSAGE } from "./mailer";
import { hashPassword, verifyPassword } from "./passwords";
import { webauthnOrigin, webauthnRpId, webauthnRpName } from "./webauthn";

const configuredSecret = process.env.BETTER_AUTH_SECRET || "";
export const customerAuthReady = configuredSecret.length >= 32;

export const customerAuth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: customerAuthReady
    ? configuredSecret
    : "disabled-customer-auth-requires-BETTER_AUTH_SECRET",
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Contraseñas con Argon2id (lib/passwords.ts). La verificación es dual:
    // acepta los hashes scrypt heredados de better-auth (N=16384, r=16, p=1,
    // mismo formato `<salt>:<digest>` que el admin por entorno) y los nuevos
    // Argon2id. El rehash oportunista NO se hace aquí: better-auth llama a
    // verify con solo {hash, password}, sin userId ni sesión, así que no hay
    // forma limpia de saber qué cuenta reescribir (ver docs/SEGURIDAD-RBAC.md
    // y la nota del cambio de contraseña más abajo). Las cuentas scrypt
    // siguen entrando hasta que se migren en un login con hook.
    password: {
      hash: async (password: string) => hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        verifyPassword(hash, password),
    },
    // Sin verificación de correo por decisión del propietario (2026-11-13): el
    // cliente entra y contrata al registrarse. No se envía ningún correo de
    // verificación ni se exige emailVerified en ningún sitio.
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Fase 1, tramo C: el reset de contraseña revoca TODAS las sesiones del
    // cliente (cierra el hueco documentado en docs/SEGURIDAD-RBAC.md: antes
    // las sesiones seguían válidas 14 días). better-auth lo hace en la
    // misma transacción que el cambio de contraseña
    // (`emailAndPassword.revokeSessionsOnPasswordReset`, utils/password.mjs).
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Sin SMTP, deliverAuthLink devuelve delivered:false y antes se ignoraba:
      // better-auth respondía éxito aunque no se enviara nada. Ahora se lanza
      // el error para que no quede como un no-op silencioso en el servidor.
      // OJO: better-auth ejecuta esto con runInBackgroundOrAwait, que traga el
      // error y devuelve éxito igualmente; la honestidad de cara al usuario
      // vive en /cuenta/recuperar, que comprueba mailerConfigured() antes de
      // pedir el enlace y no lo promete cuando el correo no está activo.
      const result = await deliverAuthLink({
        to: user.email,
        kind: "reset",
        url,
      });
      if (!result.delivered) {
        throw new Error(RESET_MAIL_UNAVAILABLE_MESSAGE);
      }
    },
  },
  user: {
    additionalFields: {},
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    cookieCache: { enabled: false },
  },
  rateLimit: { enabled: false },
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://127.0.0.1:3011"],
  plugins: [
    nextCookies(),
    // Fase 1, tramo C — passkeys de CLIENTE (plugin oficial
    // `@better-auth/passkey` 1.7.18, paquete aparte de `better-auth`).
    // El plugin exige SU PROPIO almacén: tabla `passkey` (modelo Passkey
    // en prisma/schema.prisma), distinta de PasskeyCredential, que es solo
    // del admin. El reto vive en la cookie `better-auth-passkey` del
    // plugin, no en WebauthnChallenge. RP compartido con el admin
    // (lib/webauthn.ts): mismo dominio, mismo nombre.
    passkey({
      rpID: webauthnRpId(),
      rpName: webauthnRpName(),
      origin: webauthnOrigin(),
    }),
    // Fase 1, tramo C — TOTP opcional del CLIENTE (plugin two-factor).
    // OPCIONAL: solo se exige 2FA al cliente que lo activa y verifica el
    // código (skipVerificationOnEnable sigue en false, el defecto). Al
    // activar, el plugin genera códigos de respaldo (tabla `twoFactor`).
    // Sin activar, el login no cambia.
    twoFactor({ issuer: "CaluServers" }),
  ],
});

export const auth = customerAuth;
