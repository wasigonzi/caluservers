/** In-memory login limiter. One Node process only; it is not a shared store. */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

type Bucket = { failures: number; start: number };
const buckets = new Map<string, Bucket>();

export function resetLoginRateLimit() {
  buckets.clear();
}

export function loginAttemptAllowed(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= LOGIN_WINDOW_MS) {
    if (bucket) buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - bucket.start)) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= LOGIN_WINDOW_MS) {
    buckets.set(key, { failures: 1, start: now });
    return;
  }
  bucket.failures += 1;
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
}

export function clientRateKey(headers: { get(name: string): string | null }) {
  const real = headers.get("x-real-ip")?.trim() || "";
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return (real || forwarded || "local").slice(0, 80);
}
