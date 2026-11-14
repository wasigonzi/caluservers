// Verificación end-to-end REAL del flujo sin verificación de correo: el
// cliente se registra y entra de inmediato (sin verificar nada), contrata el
// plan más barato con su dominio, el pedido y la factura aparecen en su
// panel, el admin confirma el pago a mano y el alta en WHM se completa con
// la contraseña visible en /cuenta/servicios. Arranca el stub WHM local,
// habla por HTTP con el servidor Next real (dev) y la base Postgres de
// pruebas. NUNCA toca WHM real, proveedor real ni producción.
//
// El servidor Next arranca SIN SMTP_URL ni MAIL_SINK_DIR a propósito: es el
// caso de producción. El transporte WHM real rechaza destinos no públicos
// por diseño, así que el alta por HTTP se intenta contra un WHM inalcanzable
// (prueba que el intento ocurre) y el motor real la completa en la fase VM
// contra el stub con el adaptador que envía EL MISMO payload que writeWhm.
//
// Uso (desde la raíz del repo):
//   DATABASE_URL=postgresql://e2e:e2e-test-local-only@127.0.0.1:5432/postgres \
//   node --import tsx scripts/e2e-no-email-verification.mjs
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
const BASE = "http://127.0.0.1:3014";
const STUB_PORT = process.env.STUB_PORT || "18090";
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const WRITE_TOKEN = "e2e-write-token-1234567890abcdef";
const READ_TOKEN = "e2e-read-token-1234567890abcdef";
// Destino que pasa la validación de formato pero no resuelve en DNS: el intento
// de alta por HTTP falla rápido y queda visible, sin salir a un WHM real.
const UNREACHABLE_WHM = "https://whm-nxdomain-xyz123.example.net";

const RUN = randomBytes(2).toString("hex");
const D = (base) => `${base}-${RUN}.com`;
const EMAIL_A = `e2e-noverify-a-${RUN}@prueba.test`;
const EMAIL_B = `e2e-noverify-b-${RUN}@prueba.test`;
const EMAIL_C = `e2e-noverify-c-${RUN}@prueba.test`;
const CUSTOMER_PASSWORD = `E2e-${randomBytes(9).toString("hex")}`;

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
    BLOB_READ_WRITE_TOKEN: "e2e-blob-token",
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
    ["dev", "--hostname", "127.0.0.1", "--port", "3014"],
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
      // SIN verificación: no se toca emailVerified en la BD. El login debe
      // funcionar de inmediato con el correo todavía sin verificar.
      const row = await db.user.findUnique({ where: { email } });
      check(`correo de ${email} sigue sin verificar`, row?.emailVerified === false);
      const signin = await post("/api/auth/sign-in/email", {
        body: { email, password: CUSTOMER_PASSWORD },
      });
      check(`login inmediato ${email} 200`, signin.status === 200, `status ${signin.status}`);
      check(`sesión de ${email}`, !!signin.cookie);
      return signin.cookie;
    }

    // ---- A1. Dos clientes entran sin verificar nada ----
    console.log("\n== A1. Registro y login inmediato sin verificación ==");
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

    // ---- A3. La página de contratar muestra el formulario a un cliente sin verificar ----
    console.log("\n== A3. Contratar sin verificar: formulario de dominio visible ==");
    const hire = await get("/cuenta/contratar?plan=wh0", cookieA);
    check("contratar 200", hire.status === 200, `status ${hire.status}`);
    check("muestra el botón Crear pedido", hire.text.includes("Crear pedido"));
    check("muestra el campo de dominio", hire.text.includes("Dominio para este plan"));
    check(
      "no pide correo verificado",
      !hire.text.includes("Entra con el correo verificado"),
      "sigue la puerta vieja",
    );

    async function httpOrder(tag, cookie) {
      const created = await post("/api/account/orders", {
        cookie,
        body: { planId: "wh0", domain: D(tag), idempotencyKey: `e2e-noverify-${tag}-${RUN}` },
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

    // ---- A4. Pedido + factura del plan más barato, visibles en el panel del cliente ----
    console.log("\n== A4. Pedido del plan más barato (wh0) con dominio ==");
    const created = await post("/api/account/orders", {
      cookie: cookieA,
      body: { planId: "wh0", domain: D("e2e-a"), idempotencyKey: `e2e-noverify-e2e-a-${RUN}` },
    });
    check("pedido creado 200", created.status === 200, `status ${created.status}`);
    check("total 3.99 USD", created.value?.totalCents === 399, JSON.stringify(created.value));
    const orderRow = await db.customerOrder.findUnique({
      where: { id: created.value.id },
      include: { invoice: true },
    });
    check("factura emitida", orderRow?.invoice?.status === "issued", orderRow?.invoice?.status ?? "");
    check("dominio guardado", orderRow?.domain === D("e2e-a"), orderRow?.domain ?? "");
    const invoicesPage = await get("/cuenta/facturas", cookieA);
    check("facturas del cliente 200", invoicesPage.status === 200, `status ${invoicesPage.status}`);
    check("el cliente ve su factura", invoicesPage.text.includes(orderRow.invoice.number));
    const panelPage = await get("/cuenta", cookieA);
    check("panel del cliente 200", panelPage.status === 200, `status ${panelPage.status}`);
    check("el panel muestra la factura pendiente", panelPage.text.includes(orderRow.invoice.number));

    // ---- A5. Confirmación manual: el alta SE INTENTA (no se salta en silencio) ----
    console.log("\n== A5. Confirmación manual sin SMTP: el alta se intenta ==");
    const confirmed = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: {
        action: "confirm-payment",
        invoiceId: orderRow.invoice.id,
        note: "Pago e2e recibido por transferencia.",
      },
    });
    check("pago confirmado 200", confirmed.status === 200, `status ${confirmed.status}`);
    const serviceA = await db.customerService.findUnique({ where: { orderId: orderRow.id } });
    check("servicio A pendiente de alta", serviceA?.status === "pending_provision");
    check(
      "el intento ocurrió (hay motivo de fallo de red, no de salto)",
      typeof confirmed.value?.provisionNote === "string" && confirmed.value.provisionNote.length > 0,
      confirmed.value?.provisionNote ?? "",
    );
    check(
      "el intento fallido quedó en el diario",
      (await db.commerceEvent.count({
        where: { entityId: serviceA.id, action: "service.provision_failed" },
      })) === 1,
    );
    const b = await httpOrder("e2e-b", cookieB);
    check("servicio B pendiente de alta", b.service?.status === "pending_provision");

    // ---- A6. La verificación ya no existe en el admin ----
    console.log("\n== A6. Sin rastro de verificación en el admin ==");
    const customersPage = await get("/admin/clientes", adminCookie);
    check("clientes 200", customersPage.status === 200, `status ${customersPage.status}`);
    check("sin insignia Sin verificar", !customersPage.text.includes("Sin verificar"));
    const userA = await db.user.findUnique({ where: { email: EMAIL_A } });
    const customerPage = await get(`/admin/clientes/${userA.id}`, adminCookie);
    check("ficha del cliente 200", customerPage.status === 200, `status ${customerPage.status}`);
    check(
      "sin botón Marcar correo como verificado",
      !customerPage.text.includes("Marcar correo como verificado"),
    );
    const verifyAction = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: { action: "verify-email", userId: userA.id },
    });
    check("la acción verify-email responde 400", verifyAction.status === 400, `status ${verifyAction.status}`);

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
    const aCreds = await provisionService(serviceA, D("e2e-a"));
    const bCreds = await provisionService(b.service, D("e2e-b"));

    // ---- A7. El cliente ve su contraseña en /cuenta/servicios ----
    console.log("\n== A7. Contraseña visible solo para su dueño ==");
    const pageA = await get("/cuenta/servicios", cookieA);
    check("servicios A 200", pageA.status === 200, `status ${pageA.status}`);
    check("A ve su contraseña", pageA.text.includes(aCreds.password));
    check("A ve su usuario cPanel", pageA.text.includes(aCreds.user));
    check("A NO ve la contraseña de B", !pageA.text.includes(bCreds.password));
    const pageB = await get("/cuenta/servicios", cookieB);
    check("servicios B 200", pageB.status === 200, `status ${pageB.status}`);
    check("B ve su contraseña", pageB.text.includes(bCreds.password));
    check("B NO ve la contraseña de A", !pageB.text.includes(aCreds.password));

    // ---- C. Móvil a 390px: registro real en el navegador, login, contratar, servicios ----
    console.log("\n== C. Móvil 390px (Chromium real) ==");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    async function shot(page, path, fullPage = false) {
      await page.screenshot({ path, fullPage });
      console.log(`  captura: ${path}`);
    }
    // C1. Registro real con el formulario: entra directo al área de cliente.
    const page = await context.newPage();
    await page.goto(`${BASE}/cuenta/registro`, { waitUntil: "networkidle" });
    let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check("sin desbordamiento en registro", scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
    await page.getByLabel("Nombre").fill("Cliente Móvil");
    await page.getByLabel("Email").fill(EMAIL_C);
    await page.getByLabel("Contraseña").fill(CUSTOMER_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.waitForURL(/\/cuenta$/, { timeout: 30_000 });
    check("registro en el navegador entra directo a /cuenta", true);
    const panelText = await page.content();
    check("el panel saluda al cliente nuevo", panelText.includes("Tus servicios, facturas y soporte"));
    await shot(page, "/tmp/caluservers-noverify-registro-390.png");
    // C2. Contratar con el cliente nuevo: formulario de dominio usable.
    await page.goto(`${BASE}/cuenta/contratar?plan=wh0`, { waitUntil: "networkidle" });
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check("sin desbordamiento en contratar", scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
    const contratar = await page.content();
    check("formulario de dominio visible en contratar", contratar.includes("Dominio para este plan"));
    check("botón Crear pedido visible", contratar.includes("Crear pedido"));
    check("sin puerta de verificación en contratar", !contratar.includes("Entra con el correo verificado"));
    const domainBox = page.getByLabel("Dominio para este plan");
    await domainBox.fill(D("movil-c"));
    check("el campo de dominio acepta texto", (await domainBox.inputValue()) === D("movil-c"));
    await shot(page, "/tmp/caluservers-noverify-contratar-390.png");
    // C3. Login: sin enlace de reenvío de verificación.
    await context.clearCookies();
    await page.goto(`${BASE}/cuenta/entrar`, { waitUntil: "networkidle" });
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check("sin desbordamiento en entrar", scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
    const entrar = await page.content();
    check("campos de entrar visibles", entrar.includes("Entrar"));
    check(
      "sin enlace de reenvío de verificación",
      !entrar.includes("Reenviar el enlace de verificación"),
    );
    await shot(page, "/tmp/caluservers-noverify-entrar-390.png");
    // C4. Servicios de A con su contraseña, en móvil.
    await context.addCookies(parseCookies(cookieA));
    const pageA2 = await context.newPage();
    await pageA2.goto(`${BASE}/cuenta/servicios`, { waitUntil: "networkidle" });
    scrollWidth = await pageA2.evaluate(() => document.documentElement.scrollWidth);
    check("sin desbordamiento en servicios", scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
    const servicios = await pageA2.content();
    check("contraseña de A visible en móvil", servicios.includes(aCreds.password));
    check("botón Abrir cPanel visible en móvil", servicios.includes("Abrir cPanel"));
    await shot(pageA2, "/tmp/caluservers-noverify-servicios-390.png");
    await shot(pageA2, "/tmp/caluservers-noverify-servicios-390-full.png", true);
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
