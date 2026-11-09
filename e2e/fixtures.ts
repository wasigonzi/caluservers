import { scryptSync } from "node:crypto";

export const E2E_EMAIL = "ci-admin@example.com";
export const E2E_PASSWORD = "e2e-fixture-password";
const salt = "0123456789abcdef0123456789abcdef";
export const E2E_PASSWORD_HASH = `${salt}:${scryptSync(E2E_PASSWORD, Buffer.from(salt, "hex"), 64).toString("hex")}`;
export const E2E_AUTH_SECRET = "e2e-auth-secret-not-for-production-use";
export const E2E_SETTINGS_KEY = "ab".repeat(32);

export function e2eDatabaseUrl(): string {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL es obligatorio para las pruebas de navegador");
  const url = new URL(source);
  url.pathname = "/caluservers_e2e";
  return url.toString();
}
