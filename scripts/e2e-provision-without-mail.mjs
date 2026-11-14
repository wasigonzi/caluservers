// Verificación end-to-end REAL del alta sin SMTP: el pago confirmado dispara
// el alta aunque no haya correo saliente, la contraseña inicial queda visible
// en el panel del cliente y en el de administración, el salto del alta queda
// registrado con su motivo, y /admin/provision muestra la lista de
// comprobación. Arranca el stub WHM local, habla por HTTP con el servidor
// Next real (dev) y la base Postgres de pruebas. NUNCA toca WHM real,
// proveedor real ni producción.
//
// El servidor Next arranca SIN SMTP_URL ni MAIL_SINK_DIR a propósito: es el
// caso de producción. El transporte WHM real rechaza destinos no públicos
// por diseño, así que el alta por HTTP se intenta contra un WHM inalcanzable
// (prueba que el intento ocurre) y el motor real la completa en la fase VM
// contra el stub con el adaptador que envía EL MISMO payload que writeWhm.
//
// Uso (desde la raíz del repo):
//   DATABASE_URL=postgresql://e2e:<clave>@127.0.0.1:5432/postgres \
//   node --import tsx scripts/e2e-provision-without-mail.mjs
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import { loader } from "../tests/helpers/load.mjs";
import {
  E2E_AUTH_SECRET,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_PASSWORD_HASH,
  E2E_SETTINGS_KEY,
  e2eDatabaseUrl,
} from "../e2e/fixtures.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:3013";
const STUB_PORT = process.env.STUB_PORT || "18089";
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const WRITE_TOKEN = "TEST_ONLY_WRITE_TOKEN_NOSMTP_0123456789";
const READ_TOKEN = "TEST_ONLY_READ_TOKEN_NOSMTP_0123456789";
// Destino que pasa la validación de formato pero no resuelve en DNS: el intento
// de alta por HTTP falla rápido y queda visible, sin salir a un WHM real.
const UNREACHABLE_WHM = "https://whm-nxdomain-xyz123.example.net";

const RUN = randomBytes(2).toString("hex");
const D = (base) => `${base}-${RUN}.com`;
const EMAIL_A = `e2e-nosmtp-a-${RUN}@prueba.test`;
const EMAIL_B = `e2e-nosmtp-b-${RUN}@prueba.test`;
const CUSTOMER_PASSWORD = "E2e-cliente-1234";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function waitFor(fn, label, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timeout esperando ${label}`);
}

async function stubCall(path, method = "GET", body = null) {
  const res = await fetch(`${STUB}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

function cookiesOf(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function post(path, { cookie = "", body = null } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
  const value = await res.json().catch(() => null);
  return { status: res.status, value, cookie: cookiesOf(res) };
}

async function get(path, cookie = "") {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return { status: res.status, text: await res.text() };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookies(cookieHeader) {
  return cookieHeader
    .split("; ")
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "127.0.0.1", path: "/" };
    });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio");
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });

  const stub = spawn(process.execPath, [resolve(root, "scripts/stub-whm-server.mjs")], {
    env: { ...process.env, STUB_PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stub.stdout.on("data", (d) => process.stdout.write(`[stub] ${d}`));
  stub.stderr.on("data", (d) => process.stderr.write(`[stub:err] ${d}`));

  // SIN SMTP a propósito: ni SMTP_URL ni MAIL_SINK_DIR ni MAIL_FROM. Las
  // vacías explícitas impiden que herede nada del entorno del shell.
  const serverEnv = {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(),
    ADMIN_EMAIL: E2E_EMAIL,
    ADMIN_PASSWORD_HASH: E2E_PASSWORD_HASH,
    AUTH_SECRET: E2E_AUTH_SECRET,
    SETTINGS_ENCRYPTION_KEY: E2E_SETTINGS_KEY,
    WHMCS_ALLOWED_HOST: "client.caluservers.com",
    NEXT_PUBLIC_SITE_URL: BASE,
    BLOB_READ_WRITE_TOKEN: "",
    ADMIN_TOTP_SECRET: "",
    BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
    BETTER_AUTH_URL: BASE,
    BILLING_CURRENCY: "USD",
    TAX_MODE: "none",
    SMTP_URL: "",
    MAIL_SINK_DIR: "",
    MAIL_FROM: "",
    CONTACT_INBOX: "ventas@example.com",
  };
  const server = spawn(
    resolve(root, "node_modules/.bin/next"),
    ["dev", "--hostname", "127.0.0.1", "--port", "3013"],
    { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverDead = false;
  server.on("exit", () => {
    serverDead = true;
  });
  server.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[next:err] ${d}`));

  try {
    await waitFor(async () => {
      try {
        await stubCall("/__test__/calls");
        return true;
      } catch {
        return false;
      }
    }, "stub WHM");
    const prepared = spawnSync("node", ["e2e/prepare-db.mjs"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    if (prepared.status !== 0) throw new Error("prepare-db falló");
    await waitFor(async () => {
      if (serverDead) throw new Error("el servidor Next no arrancó (¿puerto ocupado?)");
      const res = await fetch(`${BASE}/admin/login`);
      return res.ok;
    }, "servidor Next");
    await db.$queryRaw`SELECT 1`;
    await stubCall("/__test__/reset", "POST");
    console.log("== Preflight OK: stub WHM + Next + BD de pruebas (sin SMTP) ==");

    async function registerCustomer(email) {
      const signup = await post("/api/auth/sign-up/email", {
        body: { name: "Cliente E2E", email, password: CUSTOMER_PASSWORD },
      });
      check(`registro ${email} 200`, signup.status === 200, `status ${signup.status}`);
      await db.user.update({ where: { email }, data: { emailVerified: true } });
      const signin = await post("/api/auth/sign-in/email", {
        body: { email, password: CUSTOMER_PASSWORD },
      });
      check(`login ${email} 200`, signin.status === 200, `status ${signin.status}`);
      check(`sesión de ${email}`, !!signin.cookie);
      return signin.cookie;
    }

    // ---- A1. Dos clientes: A y B (B sirve para probar que la contraseña solo la ve su dueño) ----
    console.log("\n== A1. Registro y login de dos clientes ==");
    const cookieA = await registerCustomer(EMAIL_A);
    const cookieB = await registerCustomer(EMAIL_B);

    // ---- A2. Login de admin y alta configurada SIN SMTP ----
    console.log("\n== A2. Alta configurada sin SMTP ==");
    const adminLogin = await post("/api/admin/login", {
      body: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });
    check("login admin 200", adminLogin.status === 200, `status ${adminLogin.status}`);
    const adminCookie = adminLogin.cookie;
    check("sesión de admin", !!adminCookie);
    const provisionConfig = await post("/api/admin/provision", {
      cookie: adminCookie,
      body: {
        url: UNREACHABLE_WHM,
        username: "root",
        token: WRITE_TOKEN,
        enabled: true,
        packageName: "Calu Professional",
      },
    });
    check("config de alta guardada", provisionConfig.status === 200, `status ${provisionConfig.status}`);
    check(
      "lista SIN SMTP (ready=true, mailReady=false)",
      provisionConfig.value?.ready === true && provisionConfig.value?.mailReady === false,
      JSON.stringify(provisionConfig.value),
    );

    async function httpOrder(tag, cookie) {
      const created = await post("/api/account/orders", {
        cookie,
        body: { planId: "wh1", domain: D(tag), idempotencyKey: `e2e-nosmtp-${tag}-${RUN}` },
      });
      if (created.status !== 200) throw new Error(`pedido ${tag}: ${created.status}`);
      const row = await db.customerOrder.findUnique({
        where: { id: created.value.id },
        include: { invoice: true },
      });
      const confirmed = await post("/api/admin/commerce", {
        cookie: adminCookie,
        body: {
          action: "confirm-payment",
          invoiceId: row.invoice.id,
          note: "Pago e2e recibido por transferencia.",
        },
      });
      if (confirmed.status !== 200) throw new Error(`confirm ${tag}: ${confirmed.status}`);
      const service = await db.customerService.findUnique({ where: { orderId: row.id } });
      return { order: row, service, confirmed };
    }

    // ---- A3. Confirmación manual SIN SMTP: el alta SE INTENTA (no se salta en silencio) ----
    console.log("\n== A3. Confirmación manual sin SMTP: el alta se intenta ==");
    const a = await httpOrder("e2e-a", cookieA);
    check("servicio A pendiente de alta", a.service?.status === "pending_provision");
    check(
      "el intento ocurrió (hay motivo de fallo de red, no de salto)",
      typeof a.confirmed.value?.provisionNote === "string" && a.confirmed.value.provisionNote.length > 0,
      a.confirmed.value?.provisionNote ?? "",
    );
    check(
      "el motivo no es de configuración incompleta",
      !/no intentada|desactivada|sin paquete/i.test(a.confirmed.value?.provisionNote ?? ""),
      a.confirmed.value?.provisionNote ?? "",
    );
    check(
      "el intento fallido quedó en el diario",
      (await db.commerceEvent.count({
        where: { entityId: a.service.id, action: "service.provision_failed" },
      })) === 1,
    );
    const b = await httpOrder("e2e-b", cookieB);
    check("servicio B pendiente de alta", b.service?.status === "pending_provision");

    // ---- A4. /admin/provision muestra la lista de comprobación con el estado real ----
    console.log("\n== A4. Lista de comprobación en /admin/provision ==");
    const provisionPage = await get("/admin/provision", adminCookie);
    check("provision 200", provisionPage.status === 200, `status ${provisionPage.status}`);
    for (const item of [
      "Alta activada",
      "Servidor WHM",
      "Token WHM guardado",
      "Paquete WHM asignado",
      "Correo saliente (SMTP)",
    ]) {
      check(`lista muestra "${item}"`, provisionPage.text.includes(item));
    }
    check(
      "la lista dice que está lista salvo el correo",
      provisionPage.text.includes("El alta automática está lista para el próximo pago."),
    );
    check(
      "el correo aparece como no configurado, no como bloqueo",
      provisionPage.text.includes("Sin SMTP_URL la contraseña no se envía por correo"),
    );

    // ---- B. Motor real + stub WHM: el alta completa SIN SMTP ----
    console.log("\n== B. Alta en WHM sin SMTP (motor real + stub) ==");
    const h = loader({
      "@/lib/db": { db },
      "@/lib/whm-write": {
        writeWhm: async (endpoint, credentials, action, params) => {
          const body = new URLSearchParams({ "api.version": "1", ...params });
          let res;
          try {
            res = await fetch(`${STUB}/json-api/${action}`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });
          } catch {
            throw new WhmError("network");
          }
          const value = await res.json();
          if (value?.metadata?.result !== 1) throw new WhmError("rejected");
          const data = value?.data ?? {};
          return { statusmsg: "ok", user: data?.options?.username ?? data?.user ?? "" };
        },
      },
      "@/lib/whm-transport": {
        readWhm: async (endpoint, credentials, action) => {
          const res = await fetch(
            `${STUB}/json-api/${action}?api.version=1&want=user,domain,plan,suspended,diskused,disklimit`,
          );
          const value = await res.json();
          const entries = value?.data?.acct ?? [];
          return {
            rows: entries.map((e) => ({
              user: e.user,
              domain: e.domain,
              plan: e.plan,
              suspended: e.suspended,
              diskused: e.diskused,
              disklimit: e.disklimit,
            })),
            total: entries.length,
            truncated: false,
          };
        },
      },
      env: {
        AUTH_SECRET: E2E_AUTH_SECRET,
        SETTINGS_ENCRYPTION_KEY: E2E_SETTINGS_KEY,
        NODE_ENV: "development",
      },
    });
    const { WhmError } = h.load("lib/whm-security.ts");
    const provision = h.load("lib/whm-provision.ts");
    const whm = h.load("lib/whm.ts");
    await db.integrationConfig.upsert({
      where: { id: "whm" },
      create: {
        id: "whm",
        endpoint: `${STUB}`,
        encryptedCredentials: whm.encryptWhm({ username: "root", token: READ_TOKEN }),
      },
      update: {
        endpoint: `${STUB}`,
        encryptedCredentials: whm.encryptWhm({ username: "root", token: READ_TOKEN }),
      },
    });
    await db.integrationConfig.upsert({
      where: { id: "whm-provision" },
      create: {
        id: "whm-provision",
        endpoint: `${STUB}`,
        encryptedCredentials: provision.encryptProvisionCredentials({
          username: "root",
          token: WRITE_TOKEN,
        }),
      },
      update: {
        endpoint: `${STUB}`,
        encryptedCredentials: provision.encryptProvisionCredentials({
          username: "root",
          token: WRITE_TOKEN,
        }),
      },
    });
    async function stubState() {
      return stubCall("/__test__/calls");
    }
    function createCallsFor(domain, state) {
      return state.calls.filter(
        (c) => c.path === "/json-api/createacct" && c.params.domain === domain,
      );
    }
    async function provisionService(service, domain) {
      const user = provision.cpanelUsername(service.id, domain);
      const result = await provision.provisionService({ serviceId: service.id, actor: "e2e" });
      check(`alta de ${domain}`, result.status === "active");
      check(`usuario cPanel determinista (${domain})`, result.cpanelUser === user, result.cpanelUser);
      check(`sin correo, credenciales no enviadas (${domain})`, result.credentialsSent === false);
      const row = await db.customerService.findUnique({ where: { id: service.id } });
      check(`activo en BD con usuario (${domain})`, row?.status === "active" && row?.cpanelUser === user);
      check(
        `el aviso dice que la contraseña sigue en el panel (${domain})`,
        (row?.provisionError ?? "").includes("panel del cliente"),
        row?.provisionError ?? "",
      );
      const password = provision.initialPassword(service.id, user);
      const state = await stubState();
      check(`stub recibió 1 createacct (${domain})`, createCallsFor(domain, state).length === 1);
      const account = state.accounts.find((acc) => acc.user === user);
      check(`cuenta en stub WHM (${domain})`, !!account);
      check(
        `el stub recibió la contraseña determinista (${domain})`,
        account?.passwordSha256 === sha256(password),
      );
      return { user, password };
    }
    const aCreds = await provisionService(a.service, D("e2e-a"));
    const bCreds = await provisionService(b.service, D("e2e-b"));

    // ---- A5. El panel del cliente muestra SU contraseña y solo la suya ----
    console.log("\n== A5. Contraseña visible solo para su dueño ==");
    const pageA = await get("/cuenta/servicios", cookieA);
    check("servicios A 200", pageA.status === 200, `status ${pageA.status}`);
    check("A ve su contraseña", pageA.text.includes(aCreds.password));
    check("A ve su usuario cPanel", pageA.text.includes(aCreds.user));
    check("A ve la nota de cambiarla", pageA.text.includes("Cámbiala al entrar por primera vez"));
    check("A NO ve la contraseña de B", !pageA.text.includes(bCreds.password));
    const pageB = await get("/cuenta/servicios", cookieB);
    check("servicios B 200", pageB.status === 200, `status ${pageB.status}`);
    check("B ve su contraseña", pageB.text.includes(bCreds.password));
    check("B NO ve la contraseña de A", !pageB.text.includes(aCreds.password));

    // ---- A6. El admin ve la contraseña en /admin/servicios ----
    console.log("\n== A6. Contraseña visible para el admin ==");
    const adminServices = await get("/admin/servicios?estado=all", adminCookie);
    check("admin servicios 200", adminServices.status === 200, `status ${adminServices.status}`);
    check("admin ve el usuario A", adminServices.text.includes(aCreds.user));
    check("admin ve la contraseña A", adminServices.text.includes(aCreds.password));
    check("admin ve la contraseña B", adminServices.text.includes(bCreds.password));

    // ---- A7. Alta desactivada: el salto queda registrado con su motivo ----
    console.log("\n== A7. Salto registrado cuando el alta está desactivada ==");
    await db.provisionSetting.update({ where: { id: "whm" }, data: { enabled: false } });
    const c = await httpOrder("e2e-c", cookieA);
    check("servicio C pendiente de alta", c.service?.status === "pending_provision");
    check("C no se provisionó", c.confirmed.value?.provisioned === false);
    check(
      "el motivo nombra la pieza que falta",
      /alta desactivada/i.test(c.confirmed.value?.provisionNote ?? ""),
      c.confirmed.value?.provisionNote ?? "",
    );
    check(
      "evento service.provision_skipped en el diario",
      (await db.commerceEvent.count({
        where: { entityId: c.service.id, action: "service.provision_skipped" },
      })) === 1,
    );
    const cRow = await db.customerService.findUnique({ where: { id: c.service.id } });
    check(
      "el servicio C muestra el motivo",
      /alta desactivada/i.test(cRow?.provisionError ?? ""),
      cRow?.provisionError ?? "",
    );
    await db.provisionSetting.update({ where: { id: "whm" }, data: { enabled: true } });

    // ---- C. Móvil a 390px: contraseña legible, sin desbordamiento, botones pulsables ----
    console.log("\n== C. Móvil 390px ==");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    async function checkMobile(url, cookie, checks, shot) {
      await context.addCookies(parseCookies(cookie));
      const page = await context.newPage();
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`sin desbordamiento horizontal en ${url}`, scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
      const content = await page.content();
      for (const { name, text } of checks) {
        check(`${name} en ${url}`, content.includes(text));
      }
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`  captura: ${shot}`);
      const fullShot = shot.replace(/\.png$/, "-full.png");
      await page.screenshot({ path: fullShot, fullPage: true });
      console.log(`  captura: ${fullShot}`);
      await page.close();
      await context.clearCookies();
    }
    await checkMobile(
      "/cuenta/servicios",
      cookieA,
      [
        { name: "contraseña de A visible", text: aCreds.password },
        { name: "nota de cambiarla visible", text: "Cámbiala al entrar por primera vez" },
        { name: "botón Abrir cPanel visible", text: "Abrir cPanel" },
      ],
      "/tmp/caluservers-cuenta-servicios-390.png",
    );
    await checkMobile(
      "/admin/provision",
      adminCookie,
      [
        { name: "lista de comprobación visible", text: "Correo saliente (SMTP)" },
        { name: "botón Guardar visible", text: "Guardar" },
      ],
      "/tmp/caluservers-admin-provision-390.png",
    );
    await browser.close();

    console.log(`\n== Resultado: ${failures === 0 ? "TODO OK" : `${failures} fallos`} ==`);
  } finally {
    stub.kill();
    server.kill();
    await db.$disconnect();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E falló:", error);
  process.exit(1);
});
