import test from "node:test";
import assert from "node:assert/strict";
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, clientRateKey, throttleDecision } from "../lib/login-rate-limit.ts";

test("ocho intentos caben en la ventana y el noveno espera", () => {
  const start = new Date(1_000_000);
  assert.equal(throttleDecision(LOGIN_MAX_FAILURES, start, start.getTime() + 1000).allowed, true);
  const blocked = throttleDecision(LOGIN_MAX_FAILURES + 1, start, start.getTime() + 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);
  assert.equal(
    throttleDecision(LOGIN_MAX_FAILURES + 1, start, start.getTime() + LOGIN_WINDOW_MS + 1).allowed,
    true,
  );
});

test("la clave de límite usa la IP de plataforma, no la lista enviada por el cliente", () => {
  const headers = {
    get(name) {
      if (name === "x-forwarded-for") return "203.0.113.9, 198.51.100.2";
      if (name === "x-vercel-forwarded-for") return "192.0.2.10";
      return null;
    },
  };
  assert.equal(clientRateKey(headers), "192.0.2.10");
});
