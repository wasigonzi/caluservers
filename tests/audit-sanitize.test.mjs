// Sanitizador de auditoría (Fase 0): nada sensible llega a AdminAudit ni a
// CommerceEvent. Todos los valores de las pruebas son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAudit } from "../lib/audit-sanitize.ts";

test("deja pasar el texto inocuo tal cual", () => {
  assert.equal(sanitizeAudit("plan=basic;cents=1000;currency=USD"), "plan=basic;cents=1000;currency=USD");
  assert.equal(sanitizeAudit(""), "");
  assert.equal(sanitizeAudit(undefined), "");
  assert.equal(sanitizeAudit(null), "");
});

test("redacta pares clave=valor sensibles en cadenas", () => {
  assert.equal(
    sanitizeAudit("number=PF-1;note=password=hunter2"),
    "number=PF-1;note=password=[redacted]",
  );
  assert.equal(
    sanitizeAudit("token=abc123;user=admin"),
    "token=[redacted];user=admin",
  );
  assert.equal(
    sanitizeAudit("api_key=sk-live-xyz;plan=basic"),
    "api_key=[redacted];plan=basic",
  );
  assert.equal(
    sanitizeAudit("auth=Bearer-xyz;cents=100"),
    "auth=[redacted];cents=100",
  );
  assert.equal(
    sanitizeAudit("x-api-key=secreto;ok=1"),
    "x-api-key=[redacted];ok=1",
  );
  // "author" NO es sensible: es el autor de un mensaje de ticket.
  assert.equal(sanitizeAudit("author=customer;body=hola"), "author=customer;body=hola");
});

test("redacta URLs con credenciales y deja las demás intactas", () => {
  assert.equal(
    sanitizeAudit("endpoint=https://usuario:clave123@whm.example.com:2087/json-api"),
    "endpoint=https://[redacted]@whm.example.com:2087/json-api",
  );
  assert.equal(
    sanitizeAudit("endpoint=https://usuario@whm.example.com/json-api"),
    "endpoint=https://[redacted]@whm.example.com/json-api",
  );
  assert.equal(
    sanitizeAudit("ver https://caluservers.com/pedido/abc para el estado"),
    "ver https://caluservers.com/pedido/abc para el estado",
  );
});

test("redacta pares sensibles en JSON", () => {
  assert.equal(
    sanitizeAudit('{"user":"admin","password":"hunter2","plan":"basic"}'),
    '{"user":"admin","password":"[redacted]","plan":"basic"}',
  );
});

test("objetos: solo sobrevive la allowlist y sin claves sensibles", () => {
  const out = sanitizeAudit({
    plan: "basic",
    cents: 1000,
    password: "hunter2",
    apiKey: "sk-xyz",
    campoInventado: "secreto",
    nested: { token: "abc", plan: "pro" },
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.plan, "basic");
  assert.equal(parsed.cents, 1000);
  assert.equal(parsed.password, undefined);
  assert.equal(parsed.apiKey, undefined);
  assert.equal(parsed.campoInventado, undefined);
  // "nested" no está en la allowlist: se descarta entero.
  assert.equal(parsed.nested, undefined);
});

test("objetos: un campo permitido con URL con credenciales se redacta", () => {
  const parsed = JSON.parse(
    sanitizeAudit({ domain: "https://usuario:clave@host.example.com" }),
  );
  assert.equal(parsed.domain, "https://[redacted]@host.example.com");
});

test("nunca lanza ante valores raros", () => {
  assert.equal(sanitizeAudit(123), "123");
  assert.equal(sanitizeAudit(true), "true");
  assert.equal(sanitizeAudit({}), "{}");
  const cyclic = {};
  cyclic.self = cyclic;
  assert.doesNotThrow(() => sanitizeAudit(cyclic));
});
