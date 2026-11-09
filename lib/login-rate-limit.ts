/** Shared login window. The counter itself lives in Postgres, not in this process. */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

export function throttleDecision(
  failures: number,
  windowStart: Date,
  now = Date.now(),
) {
  const elapsed = now - windowStart.getTime();
  if (!Number.isFinite(failures) || elapsed >= LOGIN_WINDOW_MS) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (failures > LOGIN_MAX_FAILURES) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Prefer the platform client IP. Do not trust a caller-supplied forwarding list. */
export function clientRateKey(headers: { get(name: string): string | null }) {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "";
  const real = headers.get("x-real-ip")?.trim() || "";
  return (vercel || real || "local").slice(0, 80);
}
