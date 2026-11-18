// Plantillas de correo editables (Fase 5, frente C): render sin variables
// huérfanas, caída al texto del código sin plantilla activa y uso de la
// plantilla activa en deliverAuthLink/deliverNotice (vía sumidero).
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loader } from "./helpers/load.mjs";

function fakeDb(template) {
  return {
    mailTemplate: {
      findFirst: async () => template,
    },
  };
}

test("render: una variable sin valor queda vacía, nunca como {{variable}}", async () => {
  const h = loader({});
  const vars = h.load("lib/mail-template-vars.ts");
  assert.equal(vars.renderMailTemplateText("Hola {{name}}, entra: {{resetUrl}}", {}), "Hola , entra: ");
  assert.equal(
    vars.renderMailTemplateText("Hola {{name}}", { name: "Ana" }),
    "Hola Ana",
  );
  assert.equal(
    vars.renderMailTemplateText("{{a}}{{b}}{{a}}", { a: "x" }),
    "xx",
  );
  assert.equal(
    vars.renderMailTemplateText("Sin variables", { resetUrl: "https://x.example" }),
    "Sin variables",
  );
  assert.equal(
    vars.renderMailTemplateText("{{resetUrl}}", { resetUrl: null }),
    "",
  );
});

test("renderMailTemplate sustituye asunto y cuerpo con las mismas reglas", async () => {
  const h = loader({});
  const vars = h.load("lib/mail-template-vars.ts");
  const out = vars.renderMailTemplate(
    { subject: "Ticket: {{ticketSubject}}", body: "Léelo: {{ticketUrl}}" },
    { ticketSubject: "No entra", ticketUrl: undefined },
  );
  assert.equal(out.subject, "Ticket: No entra");
  assert.equal(out.text, "Léelo: ");
  assert.doesNotMatch(out.text, /\{\{/);
});

test("TEMPLATE_VARIABLES declara las variables de cada envío", async () => {
  const h = loader({});
  const vars = h.load("lib/mail-template-vars.ts");
  // Los arrays vienen de otro realm (vm): se comparan campo a campo.
  const names = (key) => [...vars.TEMPLATE_VARIABLES[key].map((v) => v.name)];
  assert.deepEqual(names("password-reset"), ["resetUrl"]);
  assert.deepEqual(names("ticket-reply"), ["ticketSubject", "ticketUrl"]);
  assert.deepEqual(names("ticket-new-staff"), ["ticketSubject", "ticketUrl", "customerEmail"]);
  for (const key of [...vars.MAIL_TEMPLATE_KEYS]) {
    assert.ok(Array.isArray(vars.TEMPLATE_VARIABLES[key]), key);
  }
});

test("sin plantilla activa se usa el texto de reserva tal cual", async () => {
  const h = loader({ "@/lib/db": { db: fakeDb(null) } });
  const templates = h.load("lib/mail-templates.ts");
  const out = await templates.renderMailWithTemplate({
    key: "password-reset",
    variables: { resetUrl: "https://caluservers.example/reset/abc" },
    fallback: { subject: "Reserva", text: "Texto https://caluservers.example/reset/abc" },
  });
  assert.equal(out.subject, "Reserva");
  assert.equal(out.text, "Texto https://caluservers.example/reset/abc");
});

test("con plantilla activa se renderiza su asunto y su cuerpo", async () => {
  const h = loader({
    "@/lib/db": { db: fakeDb({
      subject: "Restablece: {{ticketSubject}}",
      body: "Hola, entra aquí: {{resetUrl}} y {{missing}}",
    }) },
  });
  const templates = h.load("lib/mail-templates.ts");
  const out = await templates.renderMailWithTemplate({
    key: "password-reset",
    variables: { resetUrl: "https://caluservers.example/reset/abc" },
    fallback: { subject: "Reserva", text: "Reserva" },
  });
  assert.equal(out.subject, "Restablece: ");
  assert.equal(out.text, "Hola, entra aquí: https://caluservers.example/reset/abc y ");
  assert.doesNotMatch(out.text, /\{\{/);
});

test("si la BD no responde, la plantilla no rompe el envío: cae al texto", async () => {
  const h = loader({
    "@/lib/db": {
      db: {
        mailTemplate: {
          findFirst: async () => {
            throw new Error("BD caída");
          },
        },
      },
    },
  });
  const templates = h.load("lib/mail-templates.ts");
  const out = await templates.renderMailWithTemplate({
    key: "password-reset",
    variables: {},
    fallback: { subject: "Reserva", text: "Reserva" },
  });
  assert.equal(out.subject, "Reserva");
  assert.equal(out.text, "Reserva");
});

test("deliverAuthLink usa la plantilla activa y no deja {{resetUrl}}", async () => {
  const sink = mkdtempSync(join(tmpdir(), "calu-mail-tpl-"));
  const h = loader({
    env: { NODE_ENV: "test", MAIL_SINK_DIR: sink },
    "@/lib/db": { db: fakeDb({
      subject: "Tu enlace: {{resetUrl}}",
      body: "Entra aquí: {{resetUrl}}",
    }) },
  });
  const mailer = h.load("lib/mailer.ts");
  const result = await mailer.deliverAuthLink({
    to: "cliente@example.com",
    kind: "reset",
    url: "https://caluservers.example/reset-password/abc",
  });
  assert.equal(result.delivered, true);
  assert.equal(result.reason, "sink");
  const files = readdirSync(sink);
  assert.equal(files.length, 1);
  const content = readFileSync(join(sink, files[0]), "utf8");
  assert.match(content, /https:\/\/caluservers\.example\/reset-password\/abc/);
  assert.doesNotMatch(content, /\{\{resetUrl\}\}/);
});

test("deliverAuthLink sin plantilla usa el texto de siempre", async () => {
  const sink = mkdtempSync(join(tmpdir(), "calu-mail-fb-"));
  const h = loader({
    env: { NODE_ENV: "test", MAIL_SINK_DIR: sink },
    "@/lib/db": { db: fakeDb(null) },
  });
  const mailer = h.load("lib/mailer.ts");
  const result = await mailer.deliverAuthLink({
    to: "cliente@example.com",
    kind: "reset",
    url: "https://caluservers.example/reset-password/abc",
  });
  assert.equal(result.delivered, true);
  const files = readdirSync(sink);
  const content = readFileSync(join(sink, files[0]), "utf8");
  assert.match(content, /Este enlace es de un solo uso y caduca\./);
  assert.match(content, /https:\/\/caluservers\.example\/reset-password\/abc/);
});

test("deliverNotice con templateKey usa la plantilla; sin ella, el texto dado", async () => {
  const sink = mkdtempSync(join(tmpdir(), "calu-mail-notice-"));
  const h = loader({
    env: { NODE_ENV: "test", MAIL_SINK_DIR: sink },
    "@/lib/db": { db: fakeDb({
      subject: "Respuesta a tu ticket: {{ticketSubject}}",
      body: "Léelo aquí: {{ticketUrl}}",
    }) },
  });
  const mailer = h.load("lib/mailer.ts");
  const result = await mailer.deliverNotice({
    to: "cliente@example.com",
    subject: "Reserva",
    text: "Reserva",
    templateKey: "ticket-reply",
    variables: { ticketSubject: "No entra", ticketUrl: "https://caluservers.example/cuenta/tickets/t1" },
  });
  assert.equal(result.delivered, true);
  const files = readdirSync(sink);
  const content = readFileSync(join(sink, files[0]), "utf8");
  assert.match(content, /subject:Respuesta a tu ticket: No entra/);
  assert.match(content, /https:\/\/caluservers\.example\/cuenta\/tickets\/t1/);
  assert.doesNotMatch(content, /\{\{/);
});

test("la migración siembra las plantillas y el permiso mail:write", async () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20261118070000_mail_templates_tickets/migration.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE "MailTemplate"/);
  assert.match(sql, /CREATE TABLE "CannedReply"/);
  assert.match(sql, /CREATE TABLE "TicketAttachment"/);
  assert.match(sql, /'perm_mail_write', 'mail:write'/);
  assert.match(sql, /'role_owner'/);
  assert.match(sql, /'role_admin'/);
  for (const key of ["password-reset", "ticket-reply", "ticket-new-staff", "ticket-reply-staff"]) {
    assert.ok(sql.includes(`'${key}'`), key);
  }
});
