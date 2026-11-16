// Recuperación de contraseña honesta (arreglo 1, auditoría 2026-11-15).
// Antes RecoverForm siempre prometía "enviaremos un enlace" aunque
// deliverAuthLink devolviera delivered:false (sin SMTP en producción).
// - Sin correo: la página lo dice claro y no se pide ningún enlace.
// - Con correo: el flujo normal sigue intacto.
// Todos los tokens, correos y hosts de las pruebas son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { loader, root } from "./helpers/load.mjs";
import { resolve } from "node:path";

const HONEST =
  "El restablecimiento por correo no está activo. No se envió ningún enlace: contacta a soporte@caluservers.com para recuperar tu cuenta.";

test("sin SMTP ni sumidero el correo no está configurado y no se promete envío", async () => {
  const h = loader({ env: {} });
  const mailer = h.load("lib/mailer.ts");
  assert.equal(mailer.mailerConfigured(), false);
  // Los objetos vienen de otro realm (vm): se comparan campo a campo.
  const result = await mailer.deliverAuthLink({
    to: "cliente@example.com",
    kind: "reset",
    url: "https://caluservers.example/reset-password/abc",
  });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "unconfigured");
});

test("con SMTP_URL el correo se considera configurado (sin enviar nada)", () => {
  const h = loader({ env: { SMTP_URL: "smtp://usuario:clave@smtp.example:587" } });
  const mailer = h.load("lib/mailer.ts");
  assert.equal(mailer.mailerConfigured(), true);
});

test("fuera de producción el sumidero de archivos entrega el enlace (flujo de pruebas)", async () => {
  const sink = mkdtempSync(join(tmpdir(), "calu-mail-"));
  const h = loader({ env: { NODE_ENV: "test", MAIL_SINK_DIR: sink } });
  const mailer = h.load("lib/mailer.ts");
  assert.equal(mailer.mailerConfigured(), true);
  const result = await mailer.deliverAuthLink({
    to: "cliente@example.com",
    kind: "reset",
    url: "https://caluservers.example/reset-password/abc",
  });
  assert.equal(result.delivered, true);
  assert.equal(result.reason, "sink");
  assert.equal(readdirSync(sink).length, 1);
});

test("el mensaje honesto es único y menciona soporte@caluservers.com", () => {
  const h = loader({ env: {} });
  const mailer = h.load("lib/mailer.ts");
  assert.equal(mailer.RESET_MAIL_UNAVAILABLE_MESSAGE, HONEST);
  assert.match(HONEST, /soporte@caluservers\.com/);
});

test("sendResetPassword ya no ignora un envío fallido: lanza el mensaje honesto", () => {
  const auth = readFileSync(resolve(root, "lib/customer-auth.ts"), "utf8");
  assert.match(auth, /const result = await deliverAuthLink\(/);
  assert.match(auth, /if \(!result\.delivered\)/);
  assert.match(auth, /throw new Error\(RESET_MAIL_UNAVAILABLE_MESSAGE\)/);
  assert.match(auth, /RESET_MAIL_UNAVAILABLE_MESSAGE/);
});

test("la página de recuperar pasa el estado real del correo al formulario", () => {
  const page = readFileSync(
    resolve(root, "app/cuenta/(acceso)/recuperar/page.tsx"),
    "utf8",
  );
  assert.match(page, /import \{ mailerConfigured, RESET_MAIL_UNAVAILABLE_MESSAGE \} from "@\/lib\/mailer"/);
  assert.match(page, /const mailConfigured = mailerConfigured\(\)/);
  assert.match(page, /mailConfigured=\{mailConfigured\}/);
  assert.match(page, /unavailableMessage=\{RESET_MAIL_UNAVAILABLE_MESSAGE\}/);
});

test("RecoverForm: sin correo no pide enlace; con correo no promete éxito si falla", () => {
  const forms = readFileSync(
    resolve(root, "components/account/AccountForms.tsx"),
    "utf8",
  );
  const start = forms.indexOf("export function RecoverForm");
  const end = forms.indexOf("export function OrderButton");
  assert.ok(start >= 0 && end > start);
  const recover = forms.slice(start, end);
  assert.match(recover, /mailConfigured\?: boolean/);
  assert.match(recover, /if \(!mailConfigured\)/);
  // La rama sin correo muestra el aviso y no llama a requestPasswordReset.
  const branchStart = recover.indexOf("if (!mailConfigured)");
  const formStart = recover.indexOf("<form", branchStart);
  assert.ok(branchStart >= 0 && formStart > branchStart);
  const noMailBranch = recover.slice(branchStart, formStart);
  assert.doesNotMatch(noMailBranch, /requestPasswordReset/);
  assert.match(noMailBranch, /unavailableMessage/);
  assert.match(recover, /contacta a soporte@caluservers\.com/);
  // Con correo, el éxito solo se muestra si no hubo error.
  assert.match(recover, /const result = await customerAuthClient\.requestPasswordReset/);
  assert.match(recover, /if \(result\.error\)/);
  assert.ok(
    recover.indexOf("if (result.error)") <
      recover.indexOf('setMessage("Si la cuenta existe'),
    "el mensaje de éxito debe ir después del chequeo de error",
  );
});
