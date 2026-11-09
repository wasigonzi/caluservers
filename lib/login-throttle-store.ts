import { createHmac } from "node:crypto";
import { db } from "./db";
import { LOGIN_WINDOW_MS, throttleDecision } from "./login-rate-limit";

export function loginThrottleId(rawKey: string): string {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) {
    throw Object.assign(new Error("AUTH_SECRET is missing"), {
      name: "LoginThrottleConfigError",
    });
  }
  return createHmac("sha256", secret).update(`login:${rawKey}`).digest("hex");
}

type ThrottleRow = { failures: number; windowStart: Date };

/** Counts one attempt for every instance that shares this database. Throws if the table is unusable. */
export async function consumeLoginAttempt(rawKey: string, now = new Date()) {
  const id = loginThrottleId(rawKey);
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const rows = await db.$queryRaw<ThrottleRow[]>`
    INSERT INTO "LoginThrottle" ("id", "failures", "windowStart", "updatedAt")
    VALUES (${id}, 1, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "failures" = CASE
        WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN 1
        ELSE "LoginThrottle"."failures" + 1
      END,
      "windowStart" = CASE
        WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "LoginThrottle"."windowStart"
      END,
      "updatedAt" = ${now}
    RETURNING "failures", "windowStart"
  `;
  const row = rows[0];
  if (!row) throw new Error("Login throttle did not return a row");
  return throttleDecision(Number(row.failures), new Date(row.windowStart), now.getTime());
}

export async function clearLoginThrottle(rawKey: string) {
  const id = loginThrottleId(rawKey);
  await db.$executeRaw`DELETE FROM "LoginThrottle" WHERE "id" = ${id}`;
}
