import { adminAccessGaps, checkPassword } from "./admin-password";
import type { AccessGap, LoginCode } from "./admin-login-messages";
import { classifyDbError } from "./db-errors";
import { totpConfig, verifyTotp } from "./totp";

export type LoginDecision = {
  status: number;
  code: LoginCode | "ok";
  missing?: AccessGap[];
  retryAfterSec?: number;
};

type Attempt = { allowed: boolean; retryAfterSec: number };

export async function evaluateAdminLogin(
  input: { trusted: boolean; email: string; password: string; code: string },
  deps: {
    consume: () => Promise<Attempt>;
    clear: () => Promise<void>;
    env?: NodeJS.ProcessEnv;
  },
): Promise<LoginDecision> {
  const env = deps.env ?? process.env;
  if (!input.trusted) return { status: 403, code: "origin" };
  const gaps = adminAccessGaps(env);
  if (gaps.includes("AUTH_SECRET")) return { status: 503, code: "config", missing: gaps };
  let decision: Attempt;
  try {
    decision = await deps.consume();
  } catch (error) {
    if (error instanceof Error && error.name === "LoginThrottleConfigError") {
      return { status: 503, code: "config", missing: ["AUTH_SECRET"] };
    }
    const db = classifyDbError(error);
    return { status: 503, code: db.missingMigration ? "migration" : "database" };
  }
  if (!decision.allowed) return { status: 429, code: "rate", retryAfterSec: decision.retryAfterSec };
  const rest = gaps.filter((gap) => gap !== "AUTH_SECRET");
  if (rest.length) return { status: 503, code: "config", missing: rest };
  if (!checkPassword(input.email, input.password, env)) return { status: 401, code: "credentials" };
  const mfa = totpConfig(env.ADMIN_TOTP_SECRET);
  if (mfa === "invalid") return { status: 500, code: "mfa-config" };
  if (mfa === "ready" && !verifyTotp(env.ADMIN_TOTP_SECRET || "", input.code)) {
    return { status: 401, code: "mfa" };
  }
  try {
    await deps.clear();
  } catch {
    return { status: 503, code: "database" };
  }
  return { status: 200, code: "ok" };
}
