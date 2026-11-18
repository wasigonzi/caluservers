// Respuestas predefinidas y adjuntos de ticket (Fase 5, frente C):
// validación de adjuntos (tipo, tamaño, almacén), hash SHA-256 guardado y
// acceso solo para el dueño o el admin con tickets:reply (ajeno → 404).
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loader } from "./helpers/load.mjs";

const BIG = 10 * 1024 * 1024;

test("validateAttachment acepta imágenes, PDF, TXT y ZIP", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  for (const [fileName, mimeType] of [
    ["foto.png", "image/png"],
    ["foto.jpg", "image/jpeg"],
    ["foto.jpeg", "image/jpeg"],
    ["anim.gif", "image/gif"],
    ["foto.webp", "image/webp"],
    ["doc.pdf", "application/pdf"],
    ["notas.txt", "text/plain"],
    ["archivos.zip", "application/zip"],
    ["archivos.zip", "application/x-zip-compressed"],
  ]) {
    assert.equal(lib.validateAttachment({ fileName, mimeType, sizeBytes: 1024 }), null, fileName);
  }
  assert.equal(lib.MAX_ATTACHMENT_BYTES, BIG);
});

test("validateAttachment rechaza tipo no permitido con 400", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  for (const [fileName, mimeType] of [
    ["malware.exe", "application/x-msdownload"],
    ["script.js", "text/javascript"],
    ["doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["foto.svg", "image/svg+xml"],
  ]) {
    const error = lib.validateAttachment({ fileName, mimeType, sizeBytes: 1024 });
    assert.match(error, /no permitido/i, fileName);
  }
});

test("validateAttachment rechaza extensión que no coincide con el tipo", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  assert.match(
    lib.validateAttachment({ fileName: "foto.jpg", mimeType: "image/png", sizeBytes: 1024 }),
    /extensión/i,
  );
});

test("validateAttachment rechaza más de 10 MB y archivos vacíos", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  assert.match(
    lib.validateAttachment({ fileName: "grande.pdf", mimeType: "application/pdf", sizeBytes: BIG + 1 }),
    /10 MB/,
  );
  assert.equal(
    lib.validateAttachment({ fileName: "justo.pdf", mimeType: "application/pdf", sizeBytes: BIG }),
    null,
  );
  assert.match(
    lib.validateAttachment({ fileName: "vacio.txt", mimeType: "text/plain", sizeBytes: 0 }),
    /vacío/i,
  );
  assert.match(lib.validateAttachment({ fileName: "", mimeType: "text/plain", sizeBytes: 10 }), /nombre/i);
});

test("sha256Hex coincide con el hash de node:crypto", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  const bytes = Buffer.from("contenido de prueba", "utf8");
  assert.equal(lib.sha256Hex(bytes), createHash("sha256").update(bytes).digest("hex"));
});

test("saveTicketAttachment guarda el archivo con su hash y no usa el nombre original", async () => {
  const dir = mkdtempSync(join(tmpdir(), "calu-attach-"));
  const created = [];
  const h = loader({
    env: { NODE_ENV: "test", TICKET_ATTACHMENTS_DIR: dir },
    "@/lib/db": {
      db: {
        ticketAttachment: {
          create: async ({ data }) => {
            const row = { id: "att_1", createdAt: new Date("2026-11-18T10:00:00Z"), ...data };
            created.push(row);
            return row;
          },
        },
      },
    },
  });
  const lib = h.load("lib/ticket-attachments.ts");
  const bytes = Buffer.from("captura de pantalla falsa", "utf8");
  const row = await lib.saveTicketAttachment({
    ticketId: "ticket_1",
    messageId: null,
    fileName: "captura.png",
    mimeType: "image/png",
    bytes,
    uploadedBy: "admin@example.com",
  });
  assert.equal(row.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(row.sizeBytes, bytes.length);
  assert.equal(row.fileName, "captura.png");
  assert.equal(row.ticketId, "ticket_1");
  assert.doesNotMatch(row.storageKey, /captura/);
  assert.match(row.storageKey, /\.png$/);
  const stored = join(dir, row.storageKey);
  assert.ok(existsSync(stored), "el archivo debe existir en el directorio configurado");
  assert.equal(readFileSync(stored, "utf8"), "captura de pantalla falsa");
  assert.equal(readdirSync(dir).length, 1);
});

test("sin TICKET_ATTACHMENTS_DIR la subida se rechaza y no se guarda nada", async () => {
  const h = loader({
    env: { NODE_ENV: "test" },
    "@/lib/db": {
      db: {
        ticketAttachment: {
          create: async () => {
            throw new Error("no debería llegar a BD");
          },
        },
      },
    },
  });
  const lib = h.load("lib/ticket-attachments.ts");
  assert.equal(lib.attachmentStorageAvailable(), false);
  await assert.rejects(
    lib.saveTicketAttachment({
      ticketId: "ticket_1",
      fileName: "a.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("x"),
      uploadedBy: "admin@example.com",
    }),
    (error) => {
      assert.equal(error.status, 503);
      assert.match(error.message, /no está configurada/i);
      return true;
    },
  );
});

test("en producción el directorio debe existir: no se crea solo", async () => {
  const missing = join(tmpdir(), "calu-attach-no-existe-xyz");
  const h = loader({
    env: { NODE_ENV: "production", TICKET_ATTACHMENTS_DIR: missing },
    "@/lib/db": { db: { ticketAttachment: { create: async () => ({}) } } },
  });
  const lib = h.load("lib/ticket-attachments.ts");
  assert.equal(lib.attachmentStorageAvailable(), false);
  await assert.rejects(
    lib.saveTicketAttachment({
      ticketId: "ticket_1",
      fileName: "a.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("x"),
      uploadedBy: "admin@example.com",
    }),
    (error) => error.status === 503,
  );
  assert.equal(existsSync(missing), false);
});

test("tipo no permitido y tamaño excesivo se rechazan con 400 sin tocar disco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "calu-attach-400-"));
  const h = loader({
    env: { NODE_ENV: "test", TICKET_ATTACHMENTS_DIR: dir },
    "@/lib/db": {
      db: {
        ticketAttachment: {
          create: async () => {
            throw new Error("no debería llegar a BD");
          },
        },
      },
    },
  });
  const lib = h.load("lib/ticket-attachments.ts");
  await assert.rejects(
    lib.saveTicketAttachment({
      ticketId: "ticket_1",
      fileName: "malware.exe",
      mimeType: "application/x-msdownload",
      bytes: Buffer.from("x"),
      uploadedBy: "admin@example.com",
    }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    lib.saveTicketAttachment({
      ticketId: "ticket_1",
      fileName: "grande.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.alloc(BIG + 1),
      uploadedBy: "admin@example.com",
    }),
    (error) => error.status === 400,
  );
  assert.equal(readdirSync(dir).length, 0);
});

test("acceso al adjunto: dueño y admin con tickets:reply sí; ajeno no (→ 404)", async () => {
  const h = loader({});
  const lib = h.load("lib/ticket-attachments.ts");
  const ticket = { userId: "user_dueno" };
  assert.equal(
    lib.canAccessTicketAttachment({ adminWithReply: true, customerUserId: null }, ticket),
    true,
  );
  assert.equal(
    lib.canAccessTicketAttachment({ adminWithReply: false, customerUserId: "user_dueno" }, ticket),
    true,
  );
  assert.equal(
    lib.canAccessTicketAttachment({ adminWithReply: false, customerUserId: "user_ajeno" }, ticket),
    false,
  );
  assert.equal(
    lib.canAccessTicketAttachment({ adminWithReply: false, customerUserId: null }, ticket),
    false,
  );
});

test("attachmentFilePath rechaza claves con recorrido de directorios", async () => {
  const dir = mkdtempSync(join(tmpdir(), "calu-attach-path-"));
  const h = loader({ env: { NODE_ENV: "test", TICKET_ATTACHMENTS_DIR: dir } });
  const lib = h.load("lib/ticket-attachments.ts");
  assert.equal(lib.attachmentFilePath("../secreto.txt"), null);
  assert.equal(lib.attachmentFilePath("sub/archivo.txt"), null);
  assert.equal(lib.attachmentFilePath(""), null);
  assert.ok(lib.attachmentFilePath("abc-123.png")?.startsWith(dir));
});

test("la migración siembra 4 respuestas predefinidas genéricas en español", async () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20261118070000_mail_templates_tickets/migration.sql"),
    "utf8",
  );
  for (const id of ["canned_ack_es", "canned_more_info_es", "canned_provisioned_es", "canned_close_es"]) {
    assert.ok(sql.includes(`'${id}'`), id);
  }
  assert.match(sql, /Acuse de recibo/);
  assert.match(sql, /Petición de más datos/);
  assert.match(sql, /Confirmación de alta/);
  assert.match(sql, /Cierre del ticket/);
});

test("el formulario de respuesta ofrece las predefinidas y la descarga niega al ajeno", async () => {
  const commerce = readFileSync(join(process.cwd(), "components/admin/CommerceActions.tsx"), "utf8");
  assert.match(commerce, /\/api\/admin\/canned-replies\?active=true&locale=es/);
  assert.match(commerce, /insertCanned|Respuesta predefinida/);
  const download = readFileSync(
    join(process.cwd(), "app/api/tickets/attachments/[id]/route.ts"),
    "utf8",
  );
  assert.match(download, /canAccessTicketAttachment/);
  assert.match(download, /tickets:reply/);
  assert.match(download, /status: 404/);
  const adminUpload = readFileSync(
    join(process.cwd(), "app/api/admin/tickets/[id]/attachments/route.ts"),
    "utf8",
  );
  assert.match(adminUpload, /requirePermission\("tickets:reply"\)/);
  const shell = readFileSync(join(process.cwd(), "components/admin/AdminShell.tsx"), "utf8");
  assert.match(shell, /Plantillas de correo/);
  assert.match(shell, /\/admin\/plantillas-correo/);
  assert.match(shell, /Respuestas predefinidas/);
  assert.match(shell, /\/admin\/respuestas-predefinidas/);
});
