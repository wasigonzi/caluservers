/**
 * Respaldo de la base (Fase 6, frente C): pg_dump + age + bucket S3-compatible.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/backup.mjs [--out-dir backups/]
 *
 * 1. `pg_dump` de DATABASE_URL a `backups/caluservers-YYYYMMDD-HHMMSS.sql`.
 * 2. Si BACKUP_AGE_PUBLIC_KEY está definida y `age` está instalado, cifra
 *    el volcado (`archivo.sql.age`) y borra el .sql en claro. Si no hay
 *    clave o no hay `age`, guarda el .sql SIN cifrar con un aviso claro:
 *    nunca se finge cifrado.
 * 3. Si BACKUP_S3_ENDPOINT + BACKUP_S3_BUCKET + BACKUP_S3_ACCESS_KEY +
 *    BACKUP_S3_SECRET_KEY están las cuatro, sube el archivo al bucket
 *    (PUT con firma SigV4, sin dependencias nuevas). Si falta alguna,
 *    el respaldo queda solo en local y se avisa. Nunca se sube nada sin
 *    credenciales.
 *
 * Sin DATABASE_URL o sin `pg_dump` instalado, sale con error y no crea nada.
 * Ver docs/RESPALDOS.md (frecuencia diaria, retención 30 días + 12 meses).
 */
import { createHash, createHmac } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";

function fail(message) {
  console.error(`backup: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { outDir: "backups" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir") args.outDir = argv[++i] ?? "backups";
    else if (arg === "--help" || arg === "-h") {
      console.log("Uso: DATABASE_URL=... node scripts/backup.mjs [--out-dir backups/]");
      process.exit(0);
    } else fail(`Argumento no reconocido: ${arg}`);
  }
  return args;
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout: child.stdout }));
  });
}

async function commandExists(command) {
  try {
    await new Promise((resolve, reject) => {
      execFile(command, ["--version"], (error) => (error ? reject(error) : resolve()));
    });
    return true;
  } catch {
    return false;
  }
}

/** PUT con firma AWS SigV4 (S3-compatible). Sin dependencias nuevas. */
async function s3Put({ endpoint, bucket, accessKey, secretKey, region, key, body }) {
  const url = new URL(endpoint);
  const objectPath = `/${bucket}/${key}`;
  const target = `${url.origin}${objectPath}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = ["PUT", objectPath, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const response = await fetch(target, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`el bucket respondió ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) fail("Falta DATABASE_URL. No se creó ningún respaldo.");
if (!(await commandExists("pg_dump"))) {
  fail("`pg_dump` no está instalado en este equipo. Instala PostgreSQL client tools y repite.");
}

mkdirSync(args.outDir, { recursive: true });
const baseName = `caluservers-${timestamp()}.sql`;
const sqlPath = join(args.outDir, baseName);

// pg_dump a archivo (streaming: el volcado puede ser grande). Se espera a
// que el archivo termine de escribirse (`finish`) antes de seguir: cerrar
// el stream sin esperar pierde datos o deja el archivo vacío.
const dump = await new Promise((resolve, reject) => {
  const file = createWriteStream(sqlPath);
  const child = spawn("pg_dump", [databaseUrl], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  let failure = null;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    if (failure) reject(failure);
    else resolve({ code: 0 });
  };
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout.pipe(file);
  child.on("error", (error) => {
    failure = error;
  });
  file.on("error", (error) => {
    failure = error;
    child.kill();
  });
  child.on("close", (code) => {
    if (code !== 0 && !failure) {
      failure = new Error(stderr.trim() || `pg_dump salió con código ${code}`);
    }
    file.end();
  });
  // `finish` garantiza que todo lo que pg_dump escribió llegó al disco;
  // `close` cubre el caso en que el stream falló sin `finish`.
  file.on("finish", settle);
  file.on("close", settle);
}).catch((error) => {
  rmSync(sqlPath, { force: true });
  fail(`pg_dump falló: ${error.message}. No quedó ningún archivo parcial.`);
});
void dump;

let finalPath = sqlPath;
let encrypted = false;
const agePublicKey = (process.env.BACKUP_AGE_PUBLIC_KEY || "").trim();
if (agePublicKey) {
  if (await commandExists("age")) {
    const agePath = `${sqlPath}.age`;
    const result = await run("age", ["--encrypt", "--recipient", agePublicKey, "--output", agePath, sqlPath]);
    if (result.code === 0 && existsSync(agePath)) {
      unlinkSync(sqlPath);
      finalPath = agePath;
      encrypted = true;
    } else {
      console.warn(
        `backup: AVISO — age falló (${(result.stderr || "").trim() || `código ${result.code}`}); el respaldo queda SIN cifrar en ${sqlPath}.`,
      );
    }
  } else {
    console.warn(
      "backup: AVISO — BACKUP_AGE_PUBLIC_KEY está definida pero `age` no está instalado; el respaldo queda SIN cifrar.",
    );
  }
} else {
  console.warn("backup: AVISO — sin BACKUP_AGE_PUBLIC_KEY, el respaldo queda SIN cifrar. Genera una clave age y defínela.");
}

const size = statSync(finalPath).size;
console.log(`Respaldo creado: ${finalPath} (${size} bytes, ${encrypted ? "cifrado con age" : "SIN cifrar"}).`);

const s3 = {
  endpoint: (process.env.BACKUP_S3_ENDPOINT || "").trim(),
  bucket: (process.env.BACKUP_S3_BUCKET || "").trim(),
  accessKey: (process.env.BACKUP_S3_ACCESS_KEY || "").trim(),
  secretKey: (process.env.BACKUP_S3_SECRET_KEY || "").trim(),
};
const s3Configured = Boolean(s3.endpoint && s3.bucket && s3.accessKey && s3.secretKey);
if (!s3Configured) {
  const missing = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY", "BACKUP_S3_SECRET_KEY"].filter(
    (name) => !(process.env[name] || "").trim(),
  );
  console.log(
    `Bucket no configurado (falta: ${missing.join(", ")}): el respaldo queda solo en local. No se subió nada.`,
  );
  process.exit(0);
}

try {
  await s3Put({
    ...s3,
    region: (process.env.BACKUP_S3_REGION || "us-east-1").trim(),
    key: basename(finalPath),
    body: readFileSync(finalPath),
  });
  console.log(`Subido al bucket: ${s3.endpoint}/${s3.bucket}/${basename(finalPath)}`);
} catch (error) {
  console.error(`backup: la subida al bucket falló: ${error.message}. El respaldo local en ${finalPath} sigue ahí.`);
  process.exit(1);
}
