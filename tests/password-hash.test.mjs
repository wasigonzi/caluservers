// Contraseñas: Argon2id para lo nuevo, scrypt heredado solo para verificar.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { loader } from "./helpers/load.mjs";

const { load } = loader();
const passwords = load("lib/passwords.ts");

const PASSWORD = "contraseña-correcta-12345";

function scryptHash(password, r) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  return `${salt}:${digest}`;
}

test("roundtrip Argon2id con los parámetros OWASP por defecto", async () => {
  const hash = await passwords.hashPassword(PASSWORD);
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await passwords.verifyPassword(hash, PASSWORD), true);
  assert.equal(await passwords.verifyPassword(hash, "otra-contraseña"), false);
  assert.equal(passwords.isArgon2idHash(hash), true);
  assert.equal(passwords.isScryptHash(hash), false);
  assert.equal(passwords.needsRehash(hash), false);
});

test("el hash scrypt heredado del admin por entorno (r=8) verifica y pide rehash", async () => {
  const hash = scryptHash(PASSWORD, 8);
  assert.equal(passwords.isScryptHash(hash), true);
  assert.equal(passwords.isArgon2idHash(hash), false);
  assert.equal(passwords.needsRehash(hash), true);
  assert.equal(await passwords.verifyPassword(hash, PASSWORD), true);
  assert.equal(await passwords.verifyPassword(hash, "otra-contraseña"), false);
});

test("el hash scrypt heredado de better-auth (r=16) verifica y pide rehash", async () => {
  const hash = scryptHash(PASSWORD, 16);
  assert.equal(passwords.isScryptHash(hash), true);
  assert.equal(await passwords.verifyPassword(hash, PASSWORD), true);
  assert.equal(await passwords.verifyPassword(hash, "otra-contraseña"), false);
});

test("un formato desconocido o corrupto nunca verifica ni lanza", async () => {
  for (const bad of [
    "",
    "no-es-un-hash",
    "sha256:abc123",
    "$argon2i$v=19$m=4096,t=3,p=1$c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "$argon2id$v=19$m=19456,t=2,p=1$sal-corto$hash-corto",
    "zzzz:yyyy",
    "ab".repeat(16) + ":" + "zz".repeat(64),
  ]) {
    assert.equal(await passwords.verifyPassword(bad, PASSWORD), false, bad);
  }
  assert.equal(passwords.isArgon2idHash("no-es-un-hash"), false);
  assert.equal(passwords.isScryptHash("no-es-un-hash"), false);
  assert.equal(passwords.needsRehash("no-es-un-hash"), false);
});

test("los parámetros por defecto son los OWASP (19 MiB, t=2, p=1, 32 bytes)", () => {
  // El objeto viene de otro realm (vm): se compara campo a campo, no con deepEqual.
  const params = passwords.argon2Params();
  assert.equal(params.memoryKib, 19456);
  assert.equal(params.time, 2);
  assert.equal(params.parallelism, 1);
  assert.equal(params.hashLength, 32);
});
