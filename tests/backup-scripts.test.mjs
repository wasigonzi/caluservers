// Scripts de rotación, respaldo y restauración (Fase 6, frente C).
// Se ejecutan como subprocesos con ejecutables falsos en el PATH
// (pg_dump, age, psql) y un almacén de plugins JSON de pruebas.
// Nada toca una BD real ni sube nada a ningún bucket real.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OLD_KEY = "ab".repeat(32);
const NEW_KEY = "cd".repeat(32);

const CANNED_DUMP = `--\n-- PostgreSQL database dump\n--\n\nSET statement_timeout = 0;\nCREATE TABLE public."User" (id text NOT NULL);\nCOPY public."User" (id) FROM stdin;\n\\.\n`;

function runNode(script, args = [], env = {}) {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [join(root, script), ...args],
      { cwd: root, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        resolvePromise({ code: error ? (error.code ?? 1) : 0, stdout, stderr });
      },
    );
  });
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "caluservers-fase6-"));
}

/** Cifrado v1 (misma forma que lib/secret-box.ts) para sembrar el almacén. */
function sealSecret(aad, plaintext, keyHex) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

function openSecret(aad, value, keyHex) {
  const [version, iv, tag, body] = String(value).split(":");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "hex"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(body, "hex")), decipher.final()]).toString("utf8");
}

function writeExecutable(path, content) {
  writeFileSync(path, content, { mode: 0o755 });
  chmodSync(path, 0o755);
}

/** Binarios falsos en el PATH: pg_dump, age y psql. */
function stubBin() {
  const bin = tempDir();
  writeExecutable(
    join(bin, "pg_dump"),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pg_dump (PostgreSQL) 16.0"; exit 0; fi\ncat "$PG_DUMP_CANNED"\n`,
  );
  writeExecutable(
    join(bin, "age"),
    `#!/usr/bin/env node\nimport { copyFileSync, readFileSync } from "node:fs";\nconst args = process.argv.slice(2);\nif (args.includes("--version")) { console.log("age version 1.2.0"); process.exit(0); }\nconst outIdx = args.indexOf("--output");\nconst out = outIdx >= 0 ? args[outIdx + 1] : null;\nconst input = args[args.length - 1];\nif (out) copyFileSync(input, out); else process.stdout.write(readFileSync(input));\n`,
  );
  writeExecutable(
    join(bin, "psql"),
    `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nconst args = process.argv.slice(2);\nif (args.includes("--version")) { console.log("psql (PostgreSQL) 16.0"); process.exit(0); }\nappendFileSync(process.env.PSQL_LOG, JSON.stringify(args) + "\\n");\nprocess.exit(process.env.PSQL_EXIT ? Number(process.env.PSQL_EXIT) : 0);\n`,
  );
  return bin;
}

function seedPluginStore(dir) {
  const path = join(dir, "plugins.json");
  const rows = [
    {
      key: "stripe",
      kind: "payment",
      secretRef: sealSecret(
        "plugin:stripe:v1",
        JSON.stringify({ secretKey: "sk_test_SECRETO", webhookSecret: "whsec_SECRETO" }),
        OLD_KEY,
      ),
      lastRotatedAt: null,
    },
    {
      key: "porkbun",
      kind: "registrar",
      secretRef: sealSecret(
        "plugin:porkbun:v1",
        JSON.stringify({ apiKey: "pk1_SECRETO", secretKey: "sk1_SECRETO" }),
        OLD_KEY,
      ),
      lastRotatedAt: null,
    },
  ];
  writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`);
  return path;
}

/* --------------------------- rotate-secrets --------------------------- */

test("rotate: --generate-key imprime 64 hex y no necesita BD", async () => {
  const res = await runNode("scripts/rotate-secrets.mjs", ["--generate-key"], {
    DATABASE_URL: "",
    SETTINGS_ENCRYPTION_KEY: "",
  });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /^[a-f0-9]{64}\n/);
});

test("rotate: --dry-run sin DATABASE_URL ni almacén de pruebas sale con error y no toca nada", async () => {
  const res = await runNode("scripts/rotate-secrets.mjs", ["--dry-run"], {
    DATABASE_URL: "",
    SETTINGS_ENCRYPTION_KEY: OLD_KEY,
    PLUGIN_STORE_JSON: "",
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Falta DATABASE_URL/);
});

test("rotate: --dry-run sin clave actual sale con error", async () => {
  const dir = tempDir();
  const store = seedPluginStore(dir);
  const res = await runNode("scripts/rotate-secrets.mjs", ["--dry-run"], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    SETTINGS_ENCRYPTION_KEY: "",
    PLUGIN_STORE_JSON: store,
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /SETTINGS_ENCRYPTION_KEY/);
});

test("rotate: --dry-run lista plugins y campos sin valores y no modifica el almacén", async () => {
  const dir = tempDir();
  const store = seedPluginStore(dir);
  const before = readFileSync(store, "utf8");
  const res = await runNode("scripts/rotate-secrets.mjs", ["--dry-run"], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    SETTINGS_ENCRYPTION_KEY: OLD_KEY,
    PLUGIN_STORE_JSON: store,
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /stripe/);
  assert.match(res.stdout, /porkbun/);
  assert.match(res.stdout, /secretKey/);
  assert.doesNotMatch(res.stdout, /sk_test_SECRETO/);
  assert.doesNotMatch(res.stdout, /whsec_SECRETO/);
  assert.doesNotMatch(res.stdout, /pk1_SECRETO/);
  assert.doesNotMatch(res.stdout, /sk1_SECRETO/);
  assert.match(res.stdout, /no se tocó nada/);
  assert.equal(readFileSync(store, "utf8"), before);
});

test("rotate: --dry-run con un secreto ilegible se niega", async () => {
  const dir = tempDir();
  const store = seedPluginStore(dir);
  const rows = JSON.parse(readFileSync(store, "utf8"));
  rows[0].secretRef = "v1:00:00:00";
  writeFileSync(store, JSON.stringify(rows));
  const res = await runNode("scripts/rotate-secrets.mjs", ["--dry-run"], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    SETTINGS_ENCRYPTION_KEY: OLD_KEY,
    PLUGIN_STORE_JSON: store,
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stdout + res.stderr, /NO descifra/);
});

test("rotate: --apply sin clave nueva se niega", async () => {
  const dir = tempDir();
  const store = seedPluginStore(dir);
  const res = await runNode("scripts/rotate-secrets.mjs", ["--apply"], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    SETTINGS_ENCRYPTION_KEY: OLD_KEY,
    NEW_SETTINGS_ENCRYPTION_KEY: "",
    PLUGIN_STORE_JSON: store,
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /clave nueva/);
});

test("rotate: --apply re-cifra con la clave nueva y marca lastRotatedAt", async () => {
  const dir = tempDir();
  const store = seedPluginStore(dir);
  const res = await runNode("scripts/rotate-secrets.mjs", ["--apply"], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    SETTINGS_ENCRYPTION_KEY: OLD_KEY,
    NEW_SETTINGS_ENCRYPTION_KEY: NEW_KEY,
    PLUGIN_STORE_JSON: store,
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Rotados 2 secreto/);
  const rows = JSON.parse(readFileSync(store, "utf8"));
  for (const row of rows) {
    assert.ok(row.lastRotatedAt);
    const plaintext = openSecret(`plugin:${row.key}:v1`, row.secretRef, NEW_KEY);
    assert.ok(plaintext.length > 0);
    assert.throws(() => openSecret(`plugin:${row.key}:v1`, row.secretRef, OLD_KEY));
  }
  const stripe = JSON.parse(openSecret("plugin:stripe:v1", rows[0].secretRef, NEW_KEY));
  assert.equal(stripe.secretKey, "sk_test_SECRETO");
});

/* ------------------------------- backup ------------------------------- */

test("backup: sin DATABASE_URL sale con error y no crea nada", async () => {
  const dir = tempDir();
  const res = await runNode("scripts/backup.mjs", ["--out-dir", dir], { DATABASE_URL: "" });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /Falta DATABASE_URL/);
  assert.equal(readdirSync(dir).length, 0);
});

test("backup: sin credenciales de bucket guarda en local, sin cifrar y sin subir nada", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const canned = join(dir, "canned.sql");
  writeFileSync(canned, CANNED_DUMP);
  const res = await runNode("scripts/backup.mjs", ["--out-dir", join(dir, "backups")], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    PG_DUMP_CANNED: canned,
    BACKUP_AGE_PUBLIC_KEY: "",
    BACKUP_S3_ENDPOINT: "",
    BACKUP_S3_BUCKET: "",
    BACKUP_S3_ACCESS_KEY: "",
    BACKUP_S3_SECRET_KEY: "",
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(res.code, 0, res.stderr);
  const files = readdirSync(join(dir, "backups"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^caluservers-\d{8}-\d{6}\.sql$/);
  assert.equal(readFileSync(join(dir, "backups", files[0]), "utf8"), CANNED_DUMP);
  assert.match(res.stdout, /SIN cifrar/);
  assert.match(res.stdout, /queda solo en local/);
  assert.match(res.stdout, /No se subió nada/);
});

test("backup: con clave age y age instalado cifra y borra el .sql en claro", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const canned = join(dir, "canned.sql");
  writeFileSync(canned, CANNED_DUMP);
  const res = await runNode("scripts/backup.mjs", ["--out-dir", join(dir, "backups")], {
    DATABASE_URL: "postgresql://x:y@localhost:5432/z",
    PG_DUMP_CANNED: canned,
    BACKUP_AGE_PUBLIC_KEY: "age1testpublickey",
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(res.code, 0, res.stderr);
  const files = readdirSync(join(dir, "backups"));
  assert.equal(files.length, 1);
  assert.match(files[0], /\.sql\.age$/);
  assert.equal(readFileSync(join(dir, "backups", files[0]), "utf8"), CANNED_DUMP);
  assert.match(res.stdout, /cifrado con age/);
});

test("backup: con bucket configurado sube el archivo con firma SigV4", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const canned = join(dir, "canned.sql");
  writeFileSync(canned, CANNED_DUMP);
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || "",
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  try {
    const res = await runNode("scripts/backup.mjs", ["--out-dir", join(dir, "backups")], {
      DATABASE_URL: "postgresql://x:y@localhost:5432/z",
      PG_DUMP_CANNED: canned,
      BACKUP_S3_ENDPOINT: `http://127.0.0.1:${port}`,
      BACKUP_S3_BUCKET: "caluservers-respaldos",
      BACKUP_S3_ACCESS_KEY: "AKIDTEST",
      BACKUP_S3_SECRET_KEY: "secreto-test",
      PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(received.length, 1);
    assert.equal(received[0].method, "PUT");
    assert.match(received[0].url, /^\/caluservers-respaldos\/caluservers-\d{8}-\d{6}\.sql$/);
    assert.match(received[0].authorization, /AWS4-HMAC-SHA256 Credential=AKIDTEST\//);
    assert.equal(received[0].body, CANNED_DUMP);
    assert.match(res.stdout, /Subido al bucket/);
  } finally {
    server.close();
  }
});

/* ------------------------------- restore ------------------------------- */

test("restore: --dry-run verifica un pg_dump válido sin tocar ninguna BD", async () => {
  const dir = tempDir();
  const file = join(dir, "respaldo.sql");
  writeFileSync(file, CANNED_DUMP);
  const res = await runNode("scripts/restore.mjs", [file, "--dry-run"], {
    DATABASE_URL: "",
    BACKUP_AGE_PRIVATE_KEY: "",
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /parece un pg_dump válido/);
  assert.match(res.stdout, /no se tocó ninguna base/);
});

test("restore: --dry-run con archivo inexistente o inválido se niega", async () => {
  const dir = tempDir();
  const missing = await runNode("scripts/restore.mjs", [join(dir, "no-existe.sql")]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /no existe/);
  const bad = join(dir, "malo.sql");
  writeFileSync(bad, "esto no es un volcado\n");
  const invalid = await runNode("scripts/restore.mjs", [bad, "--dry-run"]);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /no parece un volcado de pg_dump/);
});

test("restore: --target-db sin --confirm se niega y no llama a psql", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const log = join(dir, "psql.log");
  writeFileSync(log, "");
  const file = join(dir, "respaldo.sql");
  writeFileSync(file, CANNED_DUMP);
  const res = await runNode(
    "scripts/restore.mjs",
    [file, "--target-db", "postgresql://x:y@localhost:5432/z"],
    { PSQL_LOG: log, PATH: `${bin}:${process.env.PATH}` },
  );
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /exige --confirm/);
  assert.equal(readFileSync(log, "utf8"), "");
});

test("restore: --target-db con --confirm llama a psql con la base indicada", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const log = join(dir, "psql.log");
  writeFileSync(log, "");
  const file = join(dir, "respaldo.sql");
  writeFileSync(file, CANNED_DUMP);
  const target = "postgresql://x:y@localhost:5432/caluservers_pruebas";
  const res = await runNode("scripts/restore.mjs", [file, "--target-db", target, "--confirm"], {
    PSQL_LOG: log,
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(res.code, 0, res.stderr);
  const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], target);
  assert.ok(calls[0].includes("-f"));
  assert.ok(calls[0].includes(file));
});

test("restore: --dry-run descifra un .age con la clave privada", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const ageKey = "AGE-SECRET-KEY-1TESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTEST";
  const file = join(dir, "respaldo.sql.age");
  writeFileSync(file, CANNED_DUMP);
  const res = await runNode("scripts/restore.mjs", [file, "--dry-run"], {
    BACKUP_AGE_PRIVATE_KEY: ageKey,
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /cifrado con age/);
  assert.match(res.stdout, /parece un pg_dump válido/);
});

test("restore: .age sin clave privada se niega", async () => {
  const dir = tempDir();
  const bin = stubBin();
  const file = join(dir, "respaldo.sql.age");
  writeFileSync(file, CANNED_DUMP);
  const res = await runNode("scripts/restore.mjs", [file, "--dry-run"], {
    BACKUP_AGE_PRIVATE_KEY: "",
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /BACKUP_AGE_PRIVATE_KEY/);
});
