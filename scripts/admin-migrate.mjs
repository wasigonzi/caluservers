/**
 * Migra el administrador propietario del entorno a la base de datos.
 *
 * Uso (con las variables del entorno de despliegue):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD_HASH=... DATABASE_URL=... node scripts/admin-migrate.mjs
 *
 * 1. Pide la contraseña actual por stdin y la verifica contra el hash
 *    scrypt (o Argon2id) de ADMIN_PASSWORD_HASH. Si no coincide, no toca nada.
 * 2. Si ya existe un AdminUser con ese correo, se niega sin tocar nada.
 * 3. Si no, crea el AdminUser con la contraseña guardada como Argon2id y
 *    le asigna el rol owner. Requiere que la migración
 *    20261118010000_admin_identity_rbac esté aplicada (los roles owner,
 *    admin y soporte los siembra la migración).
 *
 * La contraseña en claro nunca se imprime ni se guarda; solo se usa para
 * verificar contra el hash del entorno y generar el Argon2id. Después de
 * migrar, quita ADMIN_EMAIL y ADMIN_PASSWORD_HASH del entorno: la BD es
 * la única fuente de verdad para ese correo.
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline/promises";

const db = new PrismaClient();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function verifyScrypt(hash, password, r) {
  const [salt, digest] = hash.split(":");
  if (!/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{128}$/i.test(digest)) return false;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function verifyEnvPassword(hash, password) {
  if (typeof hash !== "string") return false;
  if (hash.startsWith("$argon2id$")) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
  if (/^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(hash)) {
    // Primero la variante del admin por entorno (defaults de Node, r=8).
    try {
      if (verifyScrypt(hash, password, 8)) return true;
    } catch {
      // Sigue con la variante de better-auth.
    }
    try {
      return verifyScrypt(hash, password, 16);
    } catch {
      return false;
    }
  }
  return false;
}

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const envHash = process.env.ADMIN_PASSWORD_HASH || "";
if (!email) fail("Falta ADMIN_EMAIL.");
if (!envHash) fail("Falta ADMIN_PASSWORD_HASH.");
if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL.");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Current admin password (input visible): ");
rl.close();
if (!password) fail("Contraseña vacía.");

if (!(await verifyEnvPassword(envHash, password))) {
  fail("La contraseña no coincide con ADMIN_PASSWORD_HASH. No se tocó nada.");
}

const existing = await db.adminUser.findFirst({
  where: { email: { equals: email, mode: "insensitive" } },
});
if (existing) {
  fail(`Ya existe un AdminUser con ${email}. No se tocó nada.`);
}

const ownerRole = await db.role.findUnique({ where: { name: "owner" } });
if (!ownerRole) {
  fail(
    "No existe el rol owner. Aplica primero la migración 20261118010000_admin_identity_rbac (npx prisma migrate deploy).",
  );
}

const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

const admin = await db.$transaction(async (tx) => {
  const created = await tx.adminUser.create({
    data: { email, passwordHash, mfaRequired: true },
  });
  await tx.adminUserRole.create({
    data: { adminUserId: created.id, roleId: ownerRole.id },
  });
  return created;
});

console.log(`AdminUser creado: ${admin.email} (rol owner, Argon2id).`);
console.log("Quita ADMIN_EMAIL y ADMIN_PASSWORD_HASH del entorno para cerrar el fallback.");
await db.$disconnect();
