import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes } from "node:crypto";
import { adminLoginMessage } from "../lib/admin-login-messages.ts";
import { evaluateAdminLogin } from "../lib/admin-login.ts";

const EMAIL = "admin-test@example.com";
const PASSWORD = "isolated-test-password";

function hashFor(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
  return `${salt}:${digest}`;
}

function env(overrides = {}) {
  return {
    ADMIN_EMAIL: EMAIL,
    ADMIN_PASSWORD_HASH: hashFor(PASSWORD),
    AUTH_SECRET: "a".repeat(32),
    ADMIN_TOTP_SECRET: "",
    ...overrides,
  };
}

function legacyVisible(status) {
  return String(new Error(
    status === 429
      ? "Demasiados intentos. Espera unos minutos."
      : "Credenciales incorrectas o configuración incompleta",
  ));
}

async function decide(input, environment, consume = async () => ({ allowed: true, retryAfterSec: 0 }), clear = async () => {}) {
  return evaluateAdminLogin(
    { trusted: true, code: "", ...input },
    { consume, clear, env: environment },
  );
}

test("el texto exacto del formulario antiguo no distingue la causa", () => {
  const seen = "Error: Credenciales incorrectas o configuración incompleta";
  for (const status of [401, 403, 500, 503]) assert.equal(legacyVisible(status), seen);
  assert.match(legacyVisible(429), /Demasiados intentos/);
  assert.notEqual(adminLoginMessage("credentials"), seen);
  assert.doesNotMatch(adminLoginMessage("config", ["AUTH_SECRET"]), /contraseña sea incorrecta|no coinciden/);
  assert.match(adminLoginMessage("config", ["AUTH_SECRET"]), /AUTH_SECRET/);
  assert.match(adminLoginMessage("migration"), /LoginThrottle/);
  assert.match(adminLoginMessage("origin"), /No se han comprobado/);
  assert.match(adminLoginMessage("mfa"), /MFA/);
  assert.doesNotMatch(adminLoginMessage("credentials"), /configuración incompleta/);
});

test("cada causa aislada obtiene un código distinto y no culpa la contraseña sin comprobarla", async () => {
  const calls = { consume: 0 };
  const count = async () => {
    calls.consume += 1;
    return { allowed: true, retryAfterSec: 0 };
  };
  const origin = await evaluateAdminLogin(
    { trusted: false, email: EMAIL, password: PASSWORD, code: "" },
    { consume: count, clear: async () => {}, env: env() },
  );
  assert.equal(origin.code, "origin");
  assert.equal(calls.consume, 0);

  const secret = await decide({ email: EMAIL, password: PASSWORD }, env({ AUTH_SECRET: "short" }), count);
  assert.equal(secret.code, "config");
  assert.deepEqual(secret.missing, ["AUTH_SECRET"]);
  assert.equal(calls.consume, 0);

  const missingHash = await decide(
    { email: EMAIL, password: PASSWORD },
    env({ ADMIN_PASSWORD_HASH: "not-a-verifier" }),
    count,
  );
  assert.equal(missingHash.code, "config");
  assert.deepEqual(missingHash.missing, ["ADMIN_PASSWORD_HASH"]);

  const missingEmail = await decide({ email: EMAIL, password: PASSWORD }, env({ ADMIN_EMAIL: "" }), count);
  assert.equal(missingEmail.code, "config");
  assert.ok(missingEmail.missing.includes("ADMIN_EMAIL"));

  const dbDown = await decide({ email: EMAIL, password: PASSWORD }, env(), async () => {
    throw Object.assign(new Error("connect"), { code: "P1001" });
  });
  assert.equal(dbDown.code, "database");

  const migration = await decide({ email: EMAIL, password: PASSWORD }, env(), async () => {
    throw Object.assign(new Error("relation"), { code: "42P01" });
  });
  assert.equal(migration.code, "migration");

  const limited = await decide({ email: EMAIL, password: PASSWORD }, env(), async () => ({ allowed: false, retryAfterSec: 30 }));
  assert.equal(limited.code, "rate");
  assert.equal(limited.status, 429);

  const wrongPassword = await decide({ email: EMAIL, password: "otra-clave-de-prueba" }, env());
  const wrongEmail = await decide({ email: "otra-persona@example.com", password: PASSWORD }, env());
  assert.equal(wrongPassword.code, "credentials");
  assert.equal(wrongEmail.code, "credentials");
  assert.equal(adminLoginMessage(wrongPassword.code), adminLoginMessage(wrongEmail.code));

  const badMfa = await decide(
    { email: EMAIL, password: PASSWORD, code: "" },
    env({ ADMIN_TOTP_SECRET: "ZZ" }),
  );
  assert.equal(badMfa.code, "mfa-config");

  const needsCode = await decide(
    { email: EMAIL, password: PASSWORD, code: "" },
    env({ ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP" }),
  );
  assert.equal(needsCode.code, "mfa");

  let cleared = false;
  const ok = await decide({ email: EMAIL, password: PASSWORD }, env(), undefined, async () => {
    cleared = true;
  });
  assert.equal(ok.code, "ok");
  assert.equal(cleared, true);
});
