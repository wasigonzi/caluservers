import test from "node:test";
import assert from "node:assert/strict";
import { totpAt, totpConfig, verifyTotp } from "../lib/totp.ts";

const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("vector RFC 6238 de 6 dígitos en el segundo 59", () => {
  assert.equal(totpAt(RFC_SECRET, 59_000), "287082");
  assert.equal(verifyTotp(RFC_BASE32, "287082", 59_000), true);
  assert.equal(verifyTotp(RFC_BASE32, "000000", 59_000), false);
  assert.equal(verifyTotp(RFC_BASE32, "287082", 59_000 + 30_000), true);
});

test("MFA queda apagado si el secreto no está y rechaza basura", () => {
  assert.equal(totpConfig(""), "off");
  assert.equal(totpConfig(undefined), "off");
  assert.equal(totpConfig("!!!"), "invalid");
  assert.equal(totpConfig(RFC_BASE32), "ready");
});
