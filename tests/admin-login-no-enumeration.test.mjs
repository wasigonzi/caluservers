// No enumeración en el login de administrador (Fase 0).
// checkPassword devuelve false de forma idéntica con email desconocido y con
// contraseña incorrecta; la ruta responde 401 "Unauthorized" en ambos casos.
// El login de cliente (better-auth) y el reset se verificaron por código:
// signIn devuelve INVALID_EMAIL_OR_PASSWORD en los dos casos y forgetPassword
// responde {status:true} exista o no la cuenta (con simulación anti-timing).
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes } from "node:crypto";
import { loader } from "./helpers/load.mjs";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "contraseña-correcta-123";
const salt = randomBytes(16).toString("hex");
const digest = scryptSync(ADMIN_PASSWORD, Buffer.from(salt, "hex"), 64).toString("hex");

const { load } = loader({
  env: {
    ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: `${salt}:${digest}`,
  },
});
const auth = load("lib/auth.ts");

test("email desconocido y contraseña incorrecta dan el mismo resultado: false", () => {
  assert.equal(auth.checkPassword("nadie@example.com", ADMIN_PASSWORD), false);
  assert.equal(auth.checkPassword(ADMIN_EMAIL, "contraseña-incorrecta"), false);
  assert.equal(auth.checkPassword("nadie@example.com", "contraseña-incorrecta"), false);
  assert.equal(auth.checkPassword("", ""), false);
});

test("la contraseña correcta con el email correcto sí entra", () => {
  assert.equal(auth.checkPassword(ADMIN_EMAIL, ADMIN_PASSWORD), true);
  assert.equal(auth.checkPassword("ADMIN@EXAMPLE.COM", ADMIN_PASSWORD), true);
});
