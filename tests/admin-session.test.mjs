// Sesiones de administrador en BD (Fase 1, tramo B).
// Una sesión revocada o una cookie HMAC vieja no autorizan; una sesión
// válida devuelve usuario, roles y permisos. La BD es un mock con la
// misma forma que Prisma; todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { loader } from "./helpers/load.mjs";

const COOKIE = "caluservers_admin_session";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "contraseña-correcta-12345";

const envSalt = randomBytes(16).toString("hex");
const envDigest = scryptSync(ADMIN_PASSWORD, Buffer.from(envSalt, "hex"), 64).toString("hex");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenForSession() {
  return randomBytes(32).toString("base64url");
}

function adminUserRow({ passwordHash, roles = ["owner"], disabledAt = null } = {}) {
  const permissions = {
    owner: ["orders:view", "roles:manage", "audit:view"],
    soporte: ["tickets:view", "tickets:reply", "clients:view"],
  };
  return {
    id: "admin_1",
    email: ADMIN_EMAIL,
    passwordHash,
    disabledAt,
    roles: roles.map((name) => ({
      role: {
        name,
        permissions: (permissions[name] || []).map((key) => ({ permission: { key } })),
      },
    })),
  };
}

function sessionRow({ token, adminUser = null, overrides = {} } = {}) {
  return {
    id: "sess_1",
    adminUserId: adminUser ? adminUser.id : null,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
    lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    revokedAt: null,
    stepUpAt: null,
    adminUser,
    ...overrides,
  };
}

function setup({ cookieValue = null, userRow = null, session = null } = {}) {
  const calls = {
    adminUserUpdate: [],
    adminSessionCreate: [],
    adminSessionUpdate: [],
    adminSessionUpdateMany: [],
    auditCreate: [],
  };
  let currentCookie = cookieValue;
  const db = {
    adminUser: {
      findFirst: async () => (userRow ? { ...userRow } : null),
      update: async (args) => {
        calls.adminUserUpdate.push(args);
        return { ...userRow, ...args.data };
      },
      count: async () => (userRow ? 1 : 0),
    },
    adminSession: {
      findUnique: async ({ where }) =>
        session && where.tokenHash === session.tokenHash ? { ...session } : null,
      create: async ({ data }) => {
        calls.adminSessionCreate.push(data);
        return { id: "sess_1", ...data };
      },
      update: async (args) => {
        calls.adminSessionUpdate.push(args);
        return {};
      },
      updateMany: async (args) => {
        calls.adminSessionUpdateMany.push(args);
        return { count: 1 };
      },
    },
    adminAudit: {
      create: async ({ data }) => {
        calls.auditCreate.push(data);
        return data;
      },
    },
  };
  const { load } = loader({
    "@/lib/db": { db },
    "next/headers": {
      cookies: async () => ({
        get: (name) =>
          name === COOKIE && currentCookie ? { value: currentCookie } : undefined,
      }),
    },
    env: {
      ADMIN_EMAIL,
      ADMIN_PASSWORD_HASH: `${envSalt}:${envDigest}`,
    },
  });
  const auth = load("lib/auth.ts");
  return { auth, calls, setCookie: (value) => { currentCookie = value; } };
}

test("createSession guarda solo el hash del token y la cookie no lleva HMAC", async () => {
  const { auth, calls } = setup();
  const token = await auth.createSession(ADMIN_EMAIL, { ip: "203.0.113.7", userAgent: "Test/1" });
  assert.equal(typeof token, "string");
  assert.equal(token.length, 43);
  assert.ok(!token.includes("."));
  assert.equal(calls.adminSessionCreate.length, 1);
  const stored = calls.adminSessionCreate[0];
  assert.equal(stored.tokenHash, sha256(token));
  assert.ok(!JSON.stringify(stored).includes(token), "el token en claro no se guarda");
  assert.equal(stored.ipHash, sha256("203.0.113.7"));
  assert.ok(!JSON.stringify(stored).includes("203.0.113.7"), "la IP no se guarda en claro");
  assert.ok(stored.expiresAt.getTime() - Date.now() > 7 * 3600 * 1000);
  assert.ok(stored.expiresAt.getTime() - Date.now() <= 8 * 3600 * 1000);
});

test("una sesión válida devuelve usuario, roles y permisos", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x", roles: ["owner"] });
  const { auth } = setup({ cookieValue: token, userRow: user, session: sessionRow({ token, adminUser: user }) });
  const info = await auth.getAdminSession();
  assert.equal(info.userId, "admin_1");
  assert.equal(info.email, ADMIN_EMAIL);
  // Las listas vienen de otro realm (vm): se comparan como texto, no con deepEqual.
  assert.equal(info.roles.join(","), "owner");
  assert.ok(info.permissions.includes("orders:view"));
  assert.ok(info.permissions.includes("roles:manage"));
  assert.equal(info.stepUpAt, null);
  assert.equal(await auth.isAdmin(), true);
});

test("una sesión revocada no autoriza", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x" });
  const { auth } = setup({
    cookieValue: token,
    userRow: user,
    session: sessionRow({ token, adminUser: user, overrides: { revokedAt: new Date() } }),
  });
  assert.equal(await auth.getAdminSession(), null);
  assert.equal(await auth.isAdmin(), false);
});

test("una sesión caducada no autoriza", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x" });
  const { auth } = setup({
    cookieValue: token,
    userRow: user,
    session: sessionRow({
      token,
      adminUser: user,
      overrides: { expiresAt: new Date(Date.now() - 1000) },
    }),
  });
  assert.equal(await auth.getAdminSession(), null);
  assert.equal(await auth.isAdmin(), false);
});

test("una cookie HMAC vieja (payload.firma) no autoriza", async () => {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 3600000, email: ADMIN_EMAIL }), "utf8").toString("base64url");
  const mac = "a".repeat(64);
  const { auth } = setup({ cookieValue: `${payload}.${mac}` });
  assert.equal(await auth.getAdminSession(), null);
  assert.equal(await auth.isAdmin(), false);
});

test("sin cookie no hay sesión", async () => {
  const { auth } = setup();
  assert.equal(await auth.getAdminSession(), null);
  assert.equal(await auth.isAdmin(), false);
});

test("un admin deshabilitado no entra aunque la sesión exista", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x", disabledAt: new Date() });
  const { auth } = setup({ cookieValue: token, userRow: user, session: sessionRow({ token, adminUser: user }) });
  assert.equal(await auth.getAdminSession(), null);
});

test("la sesión del fallback por entorno tiene permisos de owner sin AdminUser", async () => {
  const token = tokenForSession();
  const { auth } = setup({ cookieValue: token, session: sessionRow({ token, adminUser: null }) });
  const info = await auth.getAdminSession();
  assert.equal(info.userId, null);
  assert.equal(info.email, ADMIN_EMAIL);
  // Las listas vienen de otro realm (vm): se comparan como texto, no con deepEqual.
  assert.equal(info.roles.join(","), "owner");
  // 18 de las Fases 0-1 + domains:view y domains:write de la Fase 3
  // + services:terminate de la Fase 4 + kb:write de la Fase 5 (frente B)
  // + mail:write de la Fase 5 (frente C) + reports:view de la Fase 6
  // (migración compartida 20261118080000_fraud_audit_alerts).
  assert.equal(info.permissions.length, 24);
  assert.ok(info.permissions.includes("roles:manage"));
  assert.ok(info.permissions.includes("domains:view"));
  assert.ok(info.permissions.includes("domains:write"));
  assert.ok(info.permissions.includes("services:terminate"));
});

test("requirePermission sin el permiso lanza 403 y audita authz.denied sin secretos", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x", roles: ["soporte"] });
  const { auth, calls } = setup({
    cookieValue: token,
    userRow: user,
    session: sessionRow({ token, adminUser: user }),
  });
  await assert.rejects(
    auth.requirePermission("roles:manage"),
    (error) => error.status === 403 && error.message === "FORBIDDEN",
  );
  assert.equal(calls.auditCreate.length, 1);
  const audit = calls.auditCreate[0];
  assert.equal(audit.action, "authz.denied");
  assert.match(audit.details, /authz\.denied/);
  assert.match(audit.details, /roles:manage/);
  assert.ok(!audit.details.includes(token), "el token no va a la auditoría");
  assert.ok(!audit.details.includes(sha256(token)), "ni su hash va a la auditoría");
});

test("requirePermission con el permiso devuelve la sesión sin auditar", async () => {
  const token = tokenForSession();
  const user = adminUserRow({ passwordHash: "x", roles: ["soporte"] });
  const { auth, calls } = setup({
    cookieValue: token,
    userRow: user,
    session: sessionRow({ token, adminUser: user }),
  });
  const info = await auth.requirePermission("tickets:reply");
  assert.equal(info.email, ADMIN_EMAIL);
  assert.equal(calls.auditCreate.length, 0);
});

test("requirePermission sin sesión lanza UNAUTHORIZED sin auditar", async () => {
  const { auth, calls } = setup();
  await assert.rejects(auth.requirePermission("orders:view"), (error) => error.message === "UNAUTHORIZED");
  assert.equal(calls.auditCreate.length, 0);
});

test("el login correcto con hash scrypt en BD rehashea a Argon2id", async () => {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(ADMIN_PASSWORD, Buffer.from(salt, "hex"), 64).toString("hex");
  const user = adminUserRow({ passwordHash: `${salt}:${digest}` });
  const { auth, calls } = setup({ userRow: user });
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD), true);
  assert.equal(calls.adminUserUpdate.length, 1);
  const data = calls.adminUserUpdate[0].data;
  assert.match(data.passwordHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  // La fecha viene de otro realm (vm): instanceof Date no vale; se comprueba
  // que sea una fecha válida por su forma.
  assert.equal(Object.prototype.toString.call(data.lastLoginAt), "[object Date]");
  assert.ok(!Number.isNaN(data.lastLoginAt.getTime()));
});

test("el login con contraseña incorrecta no rehashea ni actualiza nada", async () => {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(ADMIN_PASSWORD, Buffer.from(salt, "hex"), 64).toString("hex");
  const user = adminUserRow({ passwordHash: `${salt}:${digest}` });
  const { auth, calls } = setup({ userRow: user });
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, "incorrecta"), false);
  assert.equal(calls.adminUserUpdate.length, 0);
});

test("sin AdminUser en BD, el fallback por entorno sigue entrando", async () => {
  const { auth } = setup();
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD), true);
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, "incorrecta"), false);
  assert.equal(await auth.verifyAdminPassword("nadie@example.com", ADMIN_PASSWORD), false);
});

test("con AdminUser en BD, la contraseña del entorno ya no vale", async () => {
  // La BD es la única fuente de verdad una vez migrado: el fallback no se
  // prueba aunque ADMIN_PASSWORD_HASH siga definido con otra contraseña.
  const otherSalt = randomBytes(16).toString("hex");
  const otherDigest = scryptSync("otra-contraseña-del-entorno", Buffer.from(otherSalt, "hex"), 64).toString("hex");
  const user = adminUserRow({ passwordHash: `${otherSalt}:${otherDigest}` });
  const { auth } = setup({ userRow: user });
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD), false);
  assert.equal(await auth.verifyAdminPassword(ADMIN_EMAIL, "otra-contraseña-del-entorno"), true);
});

test("revokeCurrentSession marca la sesión como revocada en BD", async () => {
  const token = tokenForSession();
  const { auth, calls } = setup({ cookieValue: token });
  await auth.revokeCurrentSession();
  assert.equal(calls.adminSessionUpdateMany.length, 1);
  assert.equal(calls.adminSessionUpdateMany[0].where.tokenHash, sha256(token));
  // La fecha viene de otro realm (vm): instanceof Date no vale.
  const revokedAt = calls.adminSessionUpdateMany[0].data.revokedAt;
  assert.equal(Object.prototype.toString.call(revokedAt), "[object Date]");
  assert.ok(!Number.isNaN(revokedAt.getTime()));
});

test("adminIdentityStatus distingue migrado de fallback activo", async () => {
  const migrated = setup({ userRow: adminUserRow({ passwordHash: "x" }) });
  // Los objetos vienen de otro realm (vm): se comparan como texto, no con deepEqual.
  assert.equal(
    JSON.stringify(await migrated.auth.adminIdentityStatus()),
    JSON.stringify({ envConfigured: true, ownerMigrated: true, dbAdminCount: 1 }),
  );
  const pending = setup();
  assert.equal(
    JSON.stringify(await pending.auth.adminIdentityStatus()),
    JSON.stringify({ envConfigured: true, ownerMigrated: false, dbAdminCount: 0 }),
  );
});
