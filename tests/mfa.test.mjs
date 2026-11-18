// MFA del administrador (Fase 1, tramo C): el enrolamiento TOTP exige un
// código válido y los códigos de recuperación son de un solo uso.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const RFC_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function loadMfa(dbOverrides = {}) {
  const db = {
    adminUser: { findUnique: async () => null },
    recoveryCode: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    ...dbOverrides,
  };
  const h = loader({ "@/lib/db": { db } });
  return h.load("lib/mfa.ts");
}

test("enrolar TOTP exige un código válido contra el secreto", () => {
  const mfa = loadMfa();
  assert.equal(mfa.verifyEnrolmentCode(RFC_BASE32, "287082", 59_000), true);
  assert.equal(mfa.verifyEnrolmentCode(RFC_BASE32, "000000", 59_000), false);
  assert.equal(mfa.verifyEnrolmentCode(RFC_BASE32, "", 59_000), false);
  assert.equal(mfa.verifyEnrolmentCode(RFC_BASE32, "28708", 59_000), false);
  assert.equal(mfa.verifyEnrolmentCode("!!!", "287082", 59_000), false);
});

test("la URL otpauth lleva emisor, cuenta y secreto", () => {
  const mfa = loadMfa();
  const url = mfa.totpOtpAuthUrl("CaluServers", "admin@example.com", RFC_BASE32);
  assert.match(url, /^otpauth:\/\/totp\/CaluServers:admin%40example\.com\?/);
  assert.match(url, new RegExp(`secret=${RFC_BASE32}`));
  assert.match(url, /issuer=CaluServers/);
  assert.match(url, /algorithm=SHA1&digits=6&period=30/);
});

test("se generan 10 códigos únicos con formato legible y sin caracteres ambiguos", () => {
  const mfa = loadMfa();
  const codes = mfa.generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  }
  assert.equal(mfa.generateRecoveryCodes(3).length, 3);
});

test("el hash del código es SHA-256 estable e insensible a mayúsculas y espacios", () => {
  const mfa = loadMfa();
  const a = mfa.hashRecoveryCode("abcd-efgh");
  const b = mfa.hashRecoveryCode("ABCD-EFGH");
  const c = mfa.hashRecoveryCode(" abcd-efgh ");
  assert.equal(a, b);
  assert.equal(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, mfa.hashRecoveryCode("abcd-efgi"));
});

test("un código de recuperación vale una sola vez: usado o erróneo no vale", () => {
  const mfa = loadMfa();
  const code = "ABCD-EFGH";
  const hash = mfa.hashRecoveryCode(code);
  const rows = [
    { codeHash: hash, usedAt: null },
    { codeHash: mfa.hashRecoveryCode("WXYZ-1234"), usedAt: new Date() },
  ];
  assert.ok(mfa.findUnusedRecoveryCode(rows, code));
  assert.equal(mfa.findUnusedRecoveryCode(rows, "WXYZ-1234"), null);
  assert.equal(mfa.findUnusedRecoveryCode(rows, "XXXX-XXXX"), null);
  // Tras marcarlo usado, el mismo código ya no vale.
  rows[0].usedAt = new Date();
  assert.equal(mfa.findUnusedRecoveryCode(rows, code), null);
});

test("verifyAdminRecoveryCode consume de forma atómica: el segundo uso se rechaza", async () => {
  const rows = [{ codeHash: "", usedAt: null }];
  const db = {
    adminUser: { findUnique: async () => null },
    recoveryCode: {
      findMany: async () => rows,
      updateMany: async ({ where }) => {
        const row = rows.find((candidate) => candidate.codeHash === where.codeHash);
        if (!row || row.usedAt) return { count: 0 };
        row.usedAt = new Date();
        return { count: 1 };
      },
    },
  };
  const h = loader({ "@/lib/db": { db } });
  const mfa = h.load("lib/mfa.ts");
  const code = "ABCD-EFGH";
  rows[0].codeHash = mfa.hashRecoveryCode(code);
  assert.equal(await mfa.verifyAdminRecoveryCode("admin-1", code), true);
  assert.equal(await mfa.verifyAdminRecoveryCode("admin-1", code), false);
  assert.equal(await mfa.verifyAdminRecoveryCode("admin-1", "XXXX-XXXX"), false);
});

test("el secreto TOTP de la cuenta se cifra y se abre con su AAD", async () => {
  const sealed = [];
  const db = {
    adminUser: {
      findUnique: async () => ({ totpSecretEncrypted: sealed[0] ?? null }),
    },
    recoveryCode: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
  };
  const h = loader({ "@/lib/db": { db } });
  const mfa = h.load("lib/mfa.ts");
  assert.equal(await mfa.adminTotpSecret("admin-1"), null);
  sealed[0] = mfa.sealAdminTotpSecret("admin-1", RFC_BASE32);
  assert.equal(await mfa.adminTotpSecret("admin-1"), RFC_BASE32);
  // El AAD distingue cuentas: el secreto de otra cuenta no abre.
  const other = mfa.sealAdminTotpSecret("admin-2", RFC_BASE32);
  sealed[0] = other;
  assert.equal(await mfa.adminTotpSecret("admin-1"), null);
});
