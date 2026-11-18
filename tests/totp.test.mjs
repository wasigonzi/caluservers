import test from "node:test";
import assert from "node:assert/strict";
import { totpAt, totpConfig, verifyTotp, adminMfaRequired } from "../lib/totp.ts";
import { loader } from "./helpers/load.mjs";

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

test("ADMIN_MFA_REQUIRED=true sin secreto es required-but-missing, no off", () => {
  assert.equal(totpConfig("", true), "required-but-missing");
  assert.equal(totpConfig(undefined, true), "required-but-missing");
  assert.equal(totpConfig("   ", true), "required-but-missing");
  // Con secreto válido la bandera no cambia nada: sigue ready.
  assert.equal(totpConfig(RFC_BASE32, true), "ready");
  // Con secreto inválido manda "invalid", no el estado de falta.
  assert.equal(totpConfig("!!!", true), "invalid");
  // Sin la bandera, el comportamiento anterior no cambia.
  assert.equal(totpConfig("", false), "off");
});

test("adminMfaRequired solo acepta el literal true", () => {
  assert.equal(adminMfaRequired("true"), true);
  assert.equal(adminMfaRequired("TRUE"), true);
  assert.equal(adminMfaRequired(" true "), true);
  assert.equal(adminMfaRequired("1"), false);
  assert.equal(adminMfaRequired("yes"), false);
  assert.equal(adminMfaRequired(""), false);
  assert.equal(adminMfaRequired(undefined), false);
});

test("hasPasskeyEnrolled consulta PasskeyCredential en BD (Fase 1, tramo C)", async () => {
  const fakeDb = {
    passkeyCredential: {
      count: async ({ where }) => (where.ownerType === "admin" && where.ownerId === "admin-1" ? 2 : 0),
    },
  };
  const h = loader({ "@/lib/db": { db: fakeDb } });
  const totp = h.load("lib/totp.ts");
  assert.equal(await totp.hasPasskeyEnrolled("admin", "admin-1"), true);
  assert.equal(await totp.hasPasskeyEnrolled("admin", "nadie"), false);
  assert.equal(await totp.hasPasskeyEnrolled("client", "admin-1"), false);
  // Sin BD no se puede afirmar que haya passkeys: false (fail-closed para
  // el bloqueo de MFA, que exige un método enrolado).
  const failingDb = {
    passkeyCredential: {
      count: async () => {
        throw new Error("sin BD");
      },
    },
  };
  const h2 = loader({ "@/lib/db": { db: failingDb } });
  const totp2 = h2.load("lib/totp.ts");
  assert.equal(await totp2.hasPasskeyEnrolled("admin", "admin-1"), false);
});
