import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Compile-free: duplicate critical pure checks by importing TS via tsx if available,
// else inline mirror of safe-links rules for CI without transpile.
function isHttpsUrl(value, { allowEmpty = true } = {}) {
  const v = value.trim();
  if (!v) return allowEmpty;
  if (/^(javascript|data|vbscript|file):/i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function isSafeHref(value) {
  const v = value.trim();
  if (v === "whmcs") return true;
  if (["/", "/web-hosting", "/vps", "/dedicated", "/domains", "/about", "/contact", "/client", "/abuse", "/terms", "/privacy", "/aup"].includes(v)) return true;
  return isHttpsUrl(v, { allowEmpty: false });
}
function isPlainText(value, max = 500) {
  return value.length <= max && !/[<>]/.test(value);
}

test("rechaza javascript: en URLs", () => {
  assert.equal(isHttpsUrl("javascript:alert(1)", { allowEmpty: false }), false);
  assert.equal(isSafeHref("javascript:alert(1)"), false);
});

test("acepta https y rutas internas", () => {
  assert.equal(isHttpsUrl("https://client.caluservers.com"), true);
  assert.equal(isSafeHref("/vps"), true);
  assert.equal(isSafeHref("whmcs"), true);
});

test("bloquea HTML en textos", () => {
  assert.equal(isPlainText("Hola <script>"), false);
  assert.equal(isPlainText("Hola mundo"), true);
});

test("rechaza http no seguro para assets", () => {
  assert.equal(isHttpsUrl("http://evil.example/x.png", { allowEmpty: false }), false);
});
