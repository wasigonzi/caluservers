import { scryptSync, timingSafeEqual } from "node:crypto";
import type { AccessGap } from "./admin-login-messages";

const SALT = /^[0-9a-f]{32}$/i;
const DIGEST = /^[0-9a-f]{128}$/i;

export function passwordHashReady(hash: string | undefined): boolean {
  if (!hash?.includes(":")) return false;
  const [salt, digest] = hash.split(":");
  return SALT.test(salt || "") && DIGEST.test(digest || "");
}

export function adminAccessGaps(env: NodeJS.ProcessEnv = process.env): AccessGap[] {
  const gaps: AccessGap[] = [];
  if (!(env.ADMIN_EMAIL || "").trim()) gaps.push("ADMIN_EMAIL");
  if (!passwordHashReady(env.ADMIN_PASSWORD_HASH)) gaps.push("ADMIN_PASSWORD_HASH");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) gaps.push("AUTH_SECRET");
  return gaps;
}

export function checkPassword(email: string, password: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expectedEmail = env.ADMIN_EMAIL || "";
  const hash = env.ADMIN_PASSWORD_HASH || "";
  if (!expectedEmail || email.toLowerCase() !== expectedEmail.toLowerCase() || !passwordHashReady(hash)) return false;
  const [salt, digest] = hash.split(":");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(digest, "hex");
  return timingSafeEqual(actual, expected);
}
