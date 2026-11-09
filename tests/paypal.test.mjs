import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paypalAmountValue, paypalRuntime, assertSandboxUrl } from "../lib/paypal-sandbox.ts";
import { sandboxSend } from "../lib/paypal-checkout.ts";

test("399 centavos salen como 3.99 USD para PayPal y el live ni se intenta", async () => {
  assert.equal(paypalAmountValue(399), "3.99");
  let called = false;
  await assert.rejects(
    () => sandboxSend("https://api-m.paypal.com/v2/checkout/orders", { method: "POST", headers: {} }, async () => {
      called = true;
      return { status: 200, json: {} };
    }),
    (error) => error.code === "live-rejected",
  );
  assert.equal(called, false);
  assert.throws(() => assertSandboxUrl("https://www.paypal.com/checkoutnow"), (error) => error.code === "live-rejected");
  assert.equal(paypalRuntime({ PAYPAL_MODE: "live" }).code, "live-rejected");
  assert.equal(paypalRuntime({ PAYPAL_API_BASE: "https://api.paypal.com" }).code, "live-rejected");
  assert.equal(paypalRuntime({ PAYPAL_SANDBOX_FIXTURE: "local" }, "production").code, "fixture-forbidden");
  assert.equal(paypalRuntime({
    PAYPAL_SANDBOX_FIXTURE: "local",
    PAYPAL_SANDBOX_TEST_FISCAL: "isolated",
  }, "test").ok, true);
});

test("el código no usa el token del conector ni un secreto de ejemplo", async () => {
  const source = await readFile(new URL("../lib/paypal-checkout.ts", import.meta.url), "utf8");
  assert.equal(source.includes("PAYPAL_SANDBOX_ACCESS_TOKEN"), false);
  assert.equal(source.includes("api-m.paypal.com"), false);
  assert.doesNotMatch(source, /sk_live|client_secret_placeholder|changeme/i);
});
