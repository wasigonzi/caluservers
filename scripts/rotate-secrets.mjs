/**
 * Rotación de la clave maestra de secretos (Fase 6, frente C).
 *
 * Los secretos de los plugins viven cifrados en BD con secret-box
 * (AES-256-GCM, formato `v1:iv:tag:cuerpo`, AAD `plugin:<key>:v1`) bajo
 * SETTINGS_ENCRYPTION_KEY. Este script los re-cifra con una clave nueva.
 *
 * Orden del procedimiento (ver docs/SEGURIDAD-RBAC.md):
 *   1. Genera la clave nueva:  node scripts/rotate-secrets.mjs --generate-key
 *      y guárdala en Vercel como SETTINGS_ENCRYPTION_KEY nueva (aún sin desplegar).
 *   2. Corre el script con la clave vieja (la actual en Vercel) y la nueva:
 *      SETTINGS_ENCRYPTION_KEY=<vieja> NEW_SETTINGS_ENCRYPTION_KEY=<nueva> \
 *        DATABASE_URL=... node scripts/rotate-secrets.mjs --apply
 *   3. Despliega con la clave nueva en Vercel.
 *
 * AUTH_SECRET NO se rota aquí: cambiarlo invalida todas las sesiones y
 * cookies y se hace a mano en Vercel, con los admins avisados.
 *
 * Uso:
 *   node scripts/rotate-secrets.mjs [--dry-run]   # por defecto: solo lista
 *   node scripts/rotate-secrets.mjs --apply [--old-key <hex>] [--new-key <hex>]
 *   node scripts/rotate-secrets.mjs --generate-key
 *
 * --dry-run nunca escribe nada: lista qué rotaría (plugin, campos, sin
 * valores) y verifica que cada secreto descifra con la clave actual. Sin
 * DATABASE_URL o sin SETTINGS_ENCRYPTION_KEY sale con error y no toca nada.
 * --apply exige la clave nueva explícita (--new-key o
 * NEW_SETTINGS_ENCRYPTION_KEY) y distinta de la vieja.
 *
 * Costura de pruebas: si PLUGIN_STORE_JSON apunta a un archivo JSON con
 * filas [{key, kind, secretRef, lastRotatedAt}], el script usa ese archivo
 * en vez de Prisma (solo para las pruebas; en producción no se define).
 */
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const USAGE = `Uso:
  node scripts/rotate-secrets.mjs [--dry-run]
  node scripts/rotate-secrets.mjs --apply [--old-key <hex>] [--new-key <hex>]
  node scripts/rotate-secrets.mjs --generate-key

Variables: DATABASE_URL, SETTINGS_ENCRYPTION_KEY (clave actual/vieja),
NEW_SETTINGS_ENCRYPTION_KEY (clave nueva, solo --apply).`;

function fail(message) {
  console.error(`rotate-secrets: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dryRun: true, generateKey: false, oldKey: null, newKey: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--generate-key") args.generateKey = true;
    else if (arg === "--old-key") args.oldKey = argv[++i] ?? null;
    else if (arg === "--new-key") args.newKey = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else fail(`Argumento no reconocido: ${arg}\n${USAGE}`);
  }
  return args;
}

function validKey(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

/** Abre un secreto v1 con una clave explícita (copia de lib/secret-box.ts). */
function openSecretWithKey(aad, value, keyHex) {
  const [version, iv, tag, body, ...rest] = String(value ?? "").split(":");
  if (
    version !== "v1" ||
    rest.length ||
    !/^[a-f0-9]{24}$/.test(iv ?? "") ||
    !/^[a-f0-9]{32}$/.test(tag ?? "") ||
    !/^(?:[a-f0-9]{2})+$/.test(body ?? "")
  ) {
    throw new Error("formato no válido");
  }
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "hex"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(body, "hex")), decipher.final()]).toString("utf8");
}

/** Cifra un secreto v1 con una clave explícita (copia de lib/secret-box.ts). */
function sealSecretWithKey(aad, plaintext, keyHex) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

function pluginAad(key) {
  return `plugin:${key}:v1`;
}

function secretFieldNames(plaintext) {
  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error("el contenido descifrado no es JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("el contenido descifrado no es un objeto");
  }
  return Object.keys(parsed);
}

async function loadRows() {
  const seam = process.env.PLUGIN_STORE_JSON;
  if (seam) {
    const rows = JSON.parse(readFileSync(seam, "utf8"));
    if (!Array.isArray(rows)) fail("PLUGIN_STORE_JSON no contiene una lista.");
    return { rows: rows.filter((row) => row.secretRef), save: null, seam };
  }
  if (!process.env.DATABASE_URL) {
    fail("Falta DATABASE_URL. No se tocó nada.");
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const rows = await db.plugin.findMany({ where: { secretRef: { not: null } } });
  return {
    rows,
    save: async (updated) => {
      for (const row of updated) {
        await db.plugin.update({
          where: { key: row.key },
          data: { secretRef: row.secretRef, lastRotatedAt: row.lastRotatedAt },
        });
      }
    },
    seam: null,
    disconnect: () => db.$disconnect(),
  };
}

const args = parseArgs(process.argv.slice(2));

if (args.generateKey) {
  console.log(randomBytes(32).toString("hex"));
  console.log("Guarda esta clave como SETTINGS_ENCRYPTION_KEY nueva en Vercel (paso 1 del procedimiento).");
  process.exit(0);
}

const oldKey = args.oldKey || process.env.SETTINGS_ENCRYPTION_KEY || "";
if (!validKey(oldKey)) {
  fail("Falta SETTINGS_ENCRYPTION_KEY (o --old-key): debe ser 64 caracteres hex. No se tocó nada.");
}
if (!args.dryRun) {
  const newKey = args.newKey || process.env.NEW_SETTINGS_ENCRYPTION_KEY || "";
  if (!validKey(newKey)) {
    fail("Falta la clave nueva (--new-key o NEW_SETTINGS_ENCRYPTION_KEY): debe ser 64 caracteres hex. No se tocó nada.");
  }
  if (newKey.toLowerCase() === oldKey.toLowerCase()) {
    fail("La clave nueva es igual a la vieja. Genera una distinta con --generate-key.");
  }
}

const store = await loadRows();
const { rows } = store;
if (rows.length === 0) {
  console.log("No hay secretos de plugins que rotar (ningún plugin tiene secretRef).");
  if (store.disconnect) await store.disconnect();
  process.exit(0);
}

// Verificación: cada secreto debe descifrar con la clave actual.
const verified = [];
const broken = [];
for (const row of rows) {
  try {
    const plaintext = openSecretWithKey(pluginAad(row.key), row.secretRef, oldKey);
    verified.push({ row, fields: secretFieldNames(plaintext) });
  } catch {
    broken.push(row);
  }
}

console.log(`Secretos de plugins con la clave actual: ${verified.length} verificados, ${broken.length} ilegibles.`);
for (const { row, fields } of verified) {
  // Solo nombres de campos: los valores nunca se imprimen.
  console.log(`  - ${row.key} (${row.kind || "sin kind"}): campos ${fields.join(", ") || "(vacío)"}`);
}
for (const row of broken) {
  console.log(`  ! ${row.key}: NO descifra con la clave actual (clave cambiada, AAD distinto o dato corrupto).`);
}

if (broken.length > 0) {
  if (store.disconnect) await store.disconnect();
  fail(
    `${broken.length} secreto(s) no descifran con la clave actual. No se rota nada: guarda de nuevo esos secretos en /admin/plugins y repite.`,
  );
}

if (args.dryRun) {
  console.log(
    `--dry-run: no se tocó nada. Con --apply se re-cifrarían ${verified.length} secreto(s) con la clave nueva y se actualizaría lastRotatedAt.`,
  );
  console.log("Recuerda el orden: 1. clave nueva en Vercel, 2. este script con --apply, 3. desplegar.");
  if (store.disconnect) await store.disconnect();
  process.exit(0);
}

const newKey = args.newKey || process.env.NEW_SETTINGS_ENCRYPTION_KEY || "";
const updated = verified.map(({ row, fields }) => {
  const plaintext = openSecretWithKey(pluginAad(row.key), row.secretRef, oldKey);
  return {
    ...row,
    secretRef: sealSecretWithKey(pluginAad(row.key), plaintext, newKey),
    lastRotatedAt: new Date().toISOString(),
  };
});
if (store.seam) {
  const all = JSON.parse(readFileSync(store.seam, "utf8"));
  for (const row of updated) {
    const target = all.find((entry) => entry.key === row.key);
    if (target) {
      target.secretRef = row.secretRef;
      target.lastRotatedAt = row.lastRotatedAt;
    }
  }
  writeFileSync(store.seam, `${JSON.stringify(all, null, 2)}\n`);
} else if (store.save) {
  await store.save(updated);
}
console.log(`Rotados ${updated.length} secreto(s) de plugins con la clave nueva.`);
console.log("Ahora despliega con la SETTINGS_ENCRYPTION_KEY nueva en Vercel (paso 3).");
console.log("AUTH_SECRET NO se rotó aquí: si hay que cambiarlo, se hace a mano en Vercel porque invalida las sesiones.");
if (store.disconnect) await store.disconnect();
