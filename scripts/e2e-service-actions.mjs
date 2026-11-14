// Verificación end-to-end REAL de las acciones de gestión de servicios del
// panel (/admin/servicios): cancelar, reactivar, alta manual y alta en WHM
// de un servicio activo sin cuenta, más la vista móvil a 390px. Arranca el
// stub WHM local, habla por HTTP con el servidor Next real (dev) y la base
// Postgres de pruebas. NUNCA toca WHM real, proveedor real ni producción.
//
// La fase HTTP cubre el flujo completo de acciones por la ruta real
// /api/admin/commerce (con sus guardas 401/403/404/409) y la presencia de los
// botones en la página del panel. La fase VM comprueba el alta en WHM de un
// servicio activo sin cuenta con el motor real (lib/whm-provision.ts) y el
// adaptador que envía EL MISMO payload que writeWhm al stub. La fase móvil
// abre /admin/servicios en Chromium a 390px y comprueba que las acciones se
// ven, no desbordan y se pueden pulsar.
//
// Uso (desde la raíz del repo):
//   DATABASE_URL=postgresql://e2e:<clave>@127.0.0.1:5432/postgres \
//   node --import tsx scripts/e2e-service-actions.mjs
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
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
const BASE = "http://127.0.0.1:3012";
const STUB_PORT = process.env.STUB_PORT || "18088";
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const MAIL_SINK = "/tmp/calu-mail-e2e-svc";
const WRITE_TOKEN = "TEST_ONLY_WRITE_TOKEN_SVC_0123456789";
const READ_TOKEN = "TEST_ONLY_READ_TOKEN_SVC_0123456789";
// Destino que pasa la validación de formato pero no resuelve en DNS: el intento
// de alta por HTTP falla rápido y queda visible, sin salir a un WHM real.
const UNREACHABLE_WHM = "https://whm-nxdomain-xyz123.example.net";

const RUN = randomBytes(2).toString("hex");
const D = (base) => `${base}-${RUN}.com`;
const EMAIL = `e2e-svc-${RUN}@prueba.test`;
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

function mailFor(email, cpanelUser) {
  if (!existsSync(MAIL_SINK)) return null;
  for (const file of readdirSync(MAIL_SINK)) {
    const text = readFileSync(resolve(MAIL_SINK, file), "utf8");
    if (
      text.includes(`to:${email}`) &&
      text.includes("Usuario cPanel") &&
      (!cpanelUser || text.includes(cpanelUser))
    )
      return text;
  }
  return null;
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
    MAIL_SINK_DIR: MAIL_SINK,
    MAIL_FROM: "no-reply@example.com",
    CONTACT_INBOX: "ventas@example.com",
  };
  const server = spawn(
    resolve(root, "node_modules/.bin/next"),
    ["dev", "--hostname", "127.0.0.1", "--port", "3012"],
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
    rmSync(MAIL_SINK, { recursive: true, force: true });
    mkdirSync(MAIL_SINK, { recursive: true });
    console.log("== Preflight OK: stub WHM + Next + BD de pruebas ==");

    // ---- A1. Registro e inicio de sesión del cliente (HTTP real) ----
    console.log("\n== A1. Registro y login del cliente ==");
    const signup = await post("/api/auth/sign-up/email", {
      body: { name: "Cliente E2E", email: EMAIL, password: CUSTOMER_PASSWORD },
    });
    check("registro 200", signup.status === 200, `status ${signup.status}`);
    await db.user.update({ where: { email: EMAIL }, data: { emailVerified: true } });
    const signin = await post("/api/auth/sign-in/email", {
      body: { email: EMAIL, password: CUSTOMER_PASSWORD },
    });
    check("login cliente 200", signin.status === 200, `status ${signin.status}`);
    const customerCookie = signin.cookie;
    check("sesión de cliente", !!customerCookie);

    // ---- A2. Login de admin y configuración de alta (lista, sin WHM real) ----
    console.log("\n== A2. Login de admin y alta configurada ==");
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
    check("config lista", provisionConfig.value?.ready === true, JSON.stringify(provisionConfig.value));

    async function httpOrder(tag) {
      const created = await post("/api/account/orders", {
        cookie: customerCookie,
        body: { planId: "wh1", domain: D(tag), idempotencyKey: `e2e-svc-${tag}-${RUN}` },
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
      return { order: row, service };
    }
    async function serviceStatus(serviceId, status, note, cookie = adminCookie) {
      return post("/api/admin/commerce", {
        cookie,
        body: { action: "service-status", serviceId, status, note },
      });
    }

    // ---- A3. Servicio A: alta manual, cancelación y reactivación (HTTP real) ----
    console.log("\n== A3. Alta manual, cancelar y reactivar ==");
    const a = await httpOrder("e2e-a");
    check("servicio A pendiente de alta", a.service?.status === "pending_provision");
    const manual = await serviceStatus(a.service.id, "active", "Alta manual e2e: sin WHM.");
    check("alta manual 200", manual.status === 200, `status ${manual.status}`);
    check("alta manual activa", manual.value?.status === "active");
    let aRow = await db.customerService.findUnique({ where: { id: a.service.id } });
    check("activo en BD", aRow?.status === "active");
    check("sin usuario cPanel tras la alta manual", !aRow?.cpanelUser);
    const cancel = await serviceStatus(a.service.id, "cancelled", "Baja pedida por el cliente.");
    check("cancelar 200", cancel.status === 200, `status ${cancel.status}`);
    check("cancelado", cancel.value?.status === "cancelled");
    aRow = await db.customerService.findUnique({ where: { id: a.service.id } });
    check("cancelado en BD", aRow?.status === "cancelled");
    const reactivate = await serviceStatus(a.service.id, "active", "El cliente retomó el servicio.");
    check("reactivar 200", reactivate.status === 200, `status ${reactivate.status}`);
    check("reactivado", reactivate.value?.status === "active");
    aRow = await db.customerService.findUnique({ where: { id: a.service.id } });
    check("reactivado en BD", aRow?.status === "active");
    check(
      "3 cambios en el diario (alta, baja, reactivación)",
      (await db.commerceEvent.count({
        where: { entityId: a.service.id, action: "service.status" },
      })) === 3,
    );
    const reactivateAgain = await serviceStatus(a.service.id, "active", "Otra alta no vale dos.");
    check("segunda reactivación 409", reactivateAgain.status === 409, `status ${reactivateAgain.status}`);

    // ---- A4. Guardas de la ruta ----
    console.log("\n== A4. Guardas de la ruta ==");
    const noAdmin = await serviceStatus(a.service.id, "cancelled", "Baja de prueba larga.", customerCookie);
    check("sin admin 401", noAdmin.status === 401, `status ${noAdmin.status}`);
    const unknown = await serviceStatus("svc-no-existe", "active", "Motivo de prueba largo.");
    check("servicio inexistente 404", unknown.status === 404, `status ${unknown.status}`);

    // ---- A5. Servicio B cancelado: la página muestra Reactivar y el alta en WHM ----
    console.log("\n== A5. Botones en la página del panel ==");
    const b = await httpOrder("e2e-b");
    const cancelB = await serviceStatus(b.service.id, "cancelled", "Baja pedida por el cliente.");
    check("servicio B cancelado", cancelB.value?.status === "cancelled");
    const pageAll = await get("/admin/servicios?estado=all", adminCookie);
    check("servicios 200", pageAll.status === 200, `status ${pageAll.status}`);
    check("página muestra el dominio A", pageAll.text.includes(D("e2e-a")));
    check("página muestra el dominio B", pageAll.text.includes(D("e2e-b")));
    check(
      "servicio activo sin cuenta ofrece el alta en WHM",
      pageAll.text.includes("Dar de alta en WHM ahora"),
    );
    check("servicio cancelado ofrece Reactivar", pageAll.text.includes("Reactivar"));
    const pageCancelled = await get("/admin/servicios?estado=cancelled", adminCookie);
    check("cancelados 200", pageCancelled.status === 200, `status ${pageCancelled.status}`);
    check("vista de cancelados muestra Reactivar", pageCancelled.text.includes("Reactivar"));
    check("vista de cancelados NO muestra el alta en WHM", !pageCancelled.text.includes("Dar de alta en WHM ahora"));

    // ---- C. Móvil a 390px: las acciones se ven, no desbordan y se pueden pulsar ----
    console.log("\n== C. Móvil 390px ==");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.addCookies(parseCookies(adminCookie));
    const page = await context.newPage();
    async function checkMobile(url, buttonName, shot) {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`sin desbordamiento horizontal en ${url}`, scrollWidth <= 390, `scrollWidth ${scrollWidth}`);
      const button = page.getByRole("button", { name: buttonName }).first();
      await button.scrollIntoViewIfNeeded();
      check(`botón "${buttonName}" visible`, await button.isVisible());
      const box = await button.boundingBox();
      check(
        `botón "${buttonName}" dentro del ancho de 390px`,
        !!box && box.x >= 0 && box.x + box.width <= 390 && box.width > 0,
        box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "sin caja",
      );
      await page.screenshot({ path: shot, fullPage: false });
      console.log(`  captura: ${shot}`);
    }
    await checkMobile(
      "/admin/servicios?estado=cancelled",
      "Reactivar",
      "/tmp/caluservers-servicios-390-cancelled.png",
    );
    await checkMobile(
      "/admin/servicios?estado=all",
      "Dar de alta en WHM ahora",
      "/tmp/caluservers-servicios-390-all.png",
    );
    await browser.close();

    // ---- B. Motor real + stub WHM: alta de un servicio ACTIVO sin cuenta ----
    console.log("\n== B. Alta en WHM de un servicio activo sin cuenta ==");
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
        MAIL_SINK_DIR: MAIL_SINK,
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
    const aUser = provision.cpanelUsername(a.service.id, D("e2e-a"));
    const aResult = await provision.provisionService({ serviceId: a.service.id, actor: "e2e" });
    check("alta de un servicio activo", aResult.status === "active");
    check("usuario cPanel determinista", aResult.cpanelUser === aUser, aResult.cpanelUser);
    check("credenciales enviadas", aResult.credentialsSent === true);
    let state = await stubState();
    check("stub recibió 1 createacct", createCallsFor(D("e2e-a"), state).length === 1);
    aRow = await db.customerService.findUnique({ where: { id: a.service.id } });
    check("activo en BD con usuario", aRow?.status === "active" && aRow?.cpanelUser === aUser);
    const aPassword = provision.initialPassword(a.service.id, aUser);
    const aMail = mailFor(EMAIL, aUser);
    check(
      "el correo trae la contraseña determinista",
      !!aMail && aMail.includes(`Contraseña inicial: ${aPassword}`),
    );
    const aAccount = state.accounts.find((acc) => acc.user === aUser);
    check("cuenta en stub WHM", !!aAccount);
    check(
      "el stub recibió la misma contraseña",
      aAccount?.passwordSha256 === sha256(aPassword),
    );
    const aAgain = await provision.provisionService({ serviceId: a.service.id, actor: "e2e" });
    check("re-aprovisionar no-op", aAgain.cpanelUser === aUser && aAgain.status === "active");
    state = await stubState();
    check("sigue 1 createacct", createCallsFor(D("e2e-a"), state).length === 1);


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
