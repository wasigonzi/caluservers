import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { deliverAuthLink } from "./mailer";

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
    // Sin verificación de correo por decisión del propietario (2026-11-13): el
    // cliente entra y contrata al registrarse. No se envía ningún correo de
    // verificación ni se exige emailVerified en ningún sitio.
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await deliverAuthLink({
        to: user.email,
        kind: "reset",
        url,
      });
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
  plugins: [nextCookies()],
});

export const auth = customerAuth;
