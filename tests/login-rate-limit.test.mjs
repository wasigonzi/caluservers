import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  clearLoginFailures,
  loginAttemptAllowed,
  recordLoginFailure,
  resetLoginRateLimit,
} from "../lib/login-rate-limit.ts";

test("bloquea el login tras varios fallos y se libera al vencer la ventana", () => {
  resetLoginRateLimit();
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) recordLoginFailure("203.0.113.8", now);
  const blocked = loginAttemptAllowed("203.0.113.8", now + 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);
  const later = loginAttemptAllowed("203.0.113.8", now + LOGIN_WINDOW_MS + 1);
  assert.equal(later.allowed, true);
  clearLoginFailures("203.0.113.8");
});
