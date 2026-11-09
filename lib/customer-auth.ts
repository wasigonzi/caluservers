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
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      await deliverAuthLink({
        to: user.email,
        kind: "reset",
        url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await deliverAuthLink({
        to: user.email,
        kind: "verify",
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
