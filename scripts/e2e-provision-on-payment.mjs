// Verificación end-to-end REAL del flujo compra -> pago confirmado -> alta WHM.
// Arranca el stub WHM local, habla por HTTP con el servidor Next real (dev) y
// la base Postgres de pruebas, y comprueba estados, idempotencia, fallo y
// reintento. NUNCA toca WHM real, proveedor real ni la base de producción.
//
// El transporte WHM real rechaza por diseño cualquier destino que no sea una
// dirección pública con TLS verificado, así que el éxito contra el stub se
// comprueba con el motor real (lib/whm-provision.ts) cargado en VM con un
// adaptador que envía EL MISMO payload que writeWhm (POST /json-api/createacct,
// api.version=1) al stub. La fase HTTP cubre el flujo completo hasta el
// intento de alta; la fase VM cubre el alta, la idempotencia y la re-adopción.
//
// Uso (desde la raíz del repo):
//   DATABASE_URL=postgresql://e2e:<clave>@127.0.0.1:5432/postgres \
//   node --import tsx scripts/e2e-provision-on-payment.mjs
// Las contraseñas generadas NUNCA se imprimen: solo se comprueba su forma y
// su igualdad con la determinista, y el stub solo expone su SHA-256.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
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
const BASE = "http://127.0.0.1:3011";
const STUB_PORT = process.env.STUB_PORT || "18087";
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const MAIL_SINK = "/tmp/calu-mail-e2e";
const WRITE_TOKEN = "TEST_ONLY_WRITE_TOKEN_CANARY_0123456789";
const READ_TOKEN = "TEST_ONLY_READ_TOKEN_CANARY_0123456789";
// Destino que pasa la validación de formato pero no resuelve en DNS: el intento
// de alta por HTTP falla rápido y queda visible, sin salir a un WHM real.
const UNREACHABLE_WHM = "https://whm-nxdomain-xyz123.example.net";

const RUN = randomBytes(2).toString("hex");
const D = (base) => `${base}-${RUN}.com`;
const EMAIL = `e2e-${RUN}@prueba.test`;
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
  // Se arranca el binario de Next directamente (no vía npx): así server.kill()
  // mata el proceso que escucha y no queda un huérfano en el puerto.
  const server = spawn(
    resolve(root, "node_modules/.bin/next"),
    ["dev", "--hostname", "127.0.0.1", "--port", "3011"],
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
    // La base de pruebas se resetea ANTES de arrancar el servidor: prepare-db
    // corta las conexiones a caluservers_e2e y la recrea con el esquema actual.
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

    // ---- A2. Pedido real (HTTP) -> sin pago no hay servicio ni llamada WHM ----
    console.log("\n== A2. Pedido sin pago ==");
    const orderA = await post(
      "/api/account/orders",
      {
        cookie: customerCookie,
        body: { planId: "wh1", domain: D("e2e-a"), idempotencyKey: `e2e-a-${RUN}` },
      },
    );
    check("pedido 200", orderA.status === 200, `status ${orderA.status}`);
    check("total $6.99", orderA.value?.totalCents === 699, String(orderA.value?.totalCents));
    check("moneda USD", orderA.value?.currency === "USD");
    const orderARow = await db.customerOrder.findUnique({
      where: { id: orderA.value?.id },
      include: { invoice: true, service: true },
    });
    check("pedido submitted", orderARow?.status === "submitted");
    check("sin servicio antes del pago", !orderARow?.service);
    check("sin llamadas WHM antes del pago", (await stubCall("/__test__/calls")).calls.length === 0);

    // ---- A3. Alta automática configurada, pago manual (HTTP real) ----
    console.log("\n== A3. Pago confirmado por admin ==");
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
    const confirm = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: {
        action: "confirm-payment",
        invoiceId: orderARow.invoice.id,
        note: "Pago e2e recibido por transferencia.",
      },
    });
    check("confirm-payment 200", confirm.status === 200, `status ${confirm.status}`);
    check("pago confirmado sin alta (destino inalcanzable)", confirm.value?.provisioned === false);
    check("motivo visible", !!confirm.value?.provisionNote);
    const paidA = await db.customerOrder.findUnique({
      where: { id: orderARow.id },
      include: { invoice: { include: { payment: true } }, service: true },
    });
    check("factura pagada", paidA?.invoice?.status === "paid");
    check("pedido pagado", paidA?.status === "paid");
    check("cobro manual registrado", paidA?.invoice?.payment?.provider === "manual");
    check("servicio pendiente de alta", paidA?.service?.status === "pending_provision");
    check("intento de alta registrado", (paidA?.service?.provisionAttempts ?? 0) === 1);
    check("error visible guardado", !!paidA?.service?.provisionError);
    check("sin cuentas WHM creadas", (await stubCall("/__test__/calls")).accounts.length === 0);

    // ---- A4. Confirmación duplicada: no duplica cobro ni servicio ----
    console.log("\n== A4. Confirmación duplicada ==");
    const confirm2 = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: {
        action: "confirm-payment",
        invoiceId: orderARow.invoice.id,
        note: "Pago e2e recibido por transferencia.",
      },
    });
    check("segunda confirmación 200", confirm2.status === 200, `status ${confirm2.status}`);
    const payments = await db.payment.count({ where: { invoiceId: orderARow.invoice.id } });
    check("un solo cobro", payments === 1, String(payments));
    const services = await db.customerService.count({ where: { orderId: orderARow.id } });
    check("un solo servicio", services === 1, String(services));

    // ---- A5. El cliente ve su servicio pendiente en /cuenta ----
    console.log("\n== A5. Vista del cliente ==");
    const servicesPage = await get("/cuenta/servicios", customerCookie);
    check("mis servicios 200", servicesPage.status === 200, `status ${servicesPage.status}`);
    check("muestra el dominio", servicesPage.text.includes(D("e2e-a")));
    check("muestra 'Pago recibido'", servicesPage.text.includes("Pago recibido"));

    // ---- B. Motor real + stub WHM (adaptador con el mismo payload que writeWhm) ----
    console.log("\n== B. Motor real + stub WHM ==");
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
    // Las credenciales de lectura y escritura apuntan al stub (el adaptador
    // ignora el endpoint; lo que importa es el token cifrado real).
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

    async function httpOrder(tag) {
      const created = await post("/api/account/orders", {
        cookie: customerCookie,
        body: { planId: "wh1", domain: D(tag), idempotencyKey: `e2e-${tag}-${RUN}` },
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
    async function stubState() {
      return stubCall("/__test__/calls");
    }
    function createCallsFor(domain, state) {
      return state.calls.filter(
        (c) => c.path === "/json-api/createacct" && c.params.domain === domain,
      );
    }

    // ---- B1. Éxito: 1 createacct, activo, correo con la contraseña ----
    console.log("\n== B1. Alta correcta ==");
    const b1 = await httpOrder("e2e-b1");
    const b1User = provision.cpanelUsername(b1.service.id, D("e2e-b1"));
    const b1Result = await provision.provisionService({ serviceId: b1.service.id, actor: "e2e" });
    check("alta activa", b1Result.status === "active");
    check("usuario cPanel determinista", b1Result.cpanelUser === b1User, b1Result.cpanelUser);
    check("credenciales enviadas", b1Result.credentialsSent === true);
    let state = await stubState();
    check("stub recibió 1 createacct", createCallsFor(D("e2e-b1"), state).length === 1);
    const b1Call = createCallsFor(D("e2e-b1"), state)[0];
    check("createacct api.version=1", b1Call?.params?.["api.version"] === "1");
    check("createacct plan Calu Professional", b1Call?.params?.plan === "Calu Professional");
    check("createacct contactemail", b1Call?.params?.contactemail === EMAIL);
    const b1Row = await db.customerService.findUnique({ where: { id: b1.service.id } });
    check("servicio activo en BD", b1Row?.status === "active");
    check("usuario guardado", b1Row?.cpanelUser === b1User);
    const b1Mail = mailFor(EMAIL, b1User);
    check("correo de credenciales", !!b1Mail && b1Mail.includes(b1User));
    const b1Password = provision.initialPassword(b1.service.id, b1User);
    check(
      "la contraseña enviada es la determinista",
      !!b1Mail && b1Mail.includes(`Contraseña inicial: ${b1Password}`),
    );
    const b1Account = state.accounts.find((a) => a.user === b1User);
    check("cuenta en stub WHM", !!b1Account);
    check(
      "el stub recibió la misma contraseña",
      b1Account?.passwordSha256 === sha256(b1Password),
    );
    const b1Page = await get("/cuenta/servicios", customerCookie);
    check("el cliente ve su usuario cPanel", b1Page.text.includes(b1User));

    // ---- B2. Re-aprovisionar no duplica ----
    console.log("\n== B2. Idempotencia ==");
    const b2Again = await provision.provisionService({ serviceId: b1.service.id, actor: "e2e" });
    check("re-aprovisionar no-op", b2Again.cpanelUser === b1User && b2Again.status === "active");
    state = await stubState();
    check("sigue 1 createacct", createCallsFor(D("e2e-b1"), state).length === 1);

    // ---- B3. Fallo de WHM -> pendiente con error -> reintento OK ----
    console.log("\n== B3. Fallo y reintento ==");
    const b3 = await httpOrder("e2e-b3");
    await stubCall("/__test__/mode", "POST", { failCreate: true });
    let b3Threw = false;
    try {
      await provision.provisionService({ serviceId: b3.service.id, actor: "e2e" });
    } catch {
      b3Threw = true;
    }
    check("el alta fallida lanza", b3Threw);
    let b3Row = await db.customerService.findUnique({ where: { id: b3.service.id } });
    check("vuelve a pendiente", b3Row?.status === "pending_provision");
    check("error guardado", !!b3Row?.provisionError);
    await stubCall("/__test__/mode", "POST", { failCreate: false });
    const b3Retry = await provision.provisionService({ serviceId: b3.service.id, actor: "e2e" });
    check("reintento activo", b3Retry.status === "active");
    state = await stubState();
    check("2 createacct (1 fallido + 1 OK)", createCallsFor(D("e2e-b3"), state).length === 2);
    b3Row = await db.customerService.findUnique({ where: { id: b3.service.id } });
    check("error limpio tras el éxito", !b3Row?.provisionError);

    // ---- B4. Respuesta perdida -> la cuenta se adopta, no se duplica ----
    console.log("\n== B4. Respuesta perdida y re-adopción ==");
    const b4 = await httpOrder("e2e-b4");
    const b4User = provision.cpanelUsername(b4.service.id, D("e2e-b4"));
    await stubCall("/__test__/mode", "POST", { dropCreate: true });
    const b4Result = await provision.provisionService({ serviceId: b4.service.id, actor: "e2e" });
    check("adoptada y activa", b4Result.status === "active");
    check("mismo usuario adoptado", b4Result.cpanelUser === b4User);
    check("credenciales enviadas tras adoptar", b4Result.credentialsSent === true);
    await stubCall("/__test__/mode", "POST", { dropCreate: false });
    state = await stubState();
    check("solo 1 createacct", createCallsFor(D("e2e-b4"), state).length === 1);
    check(
      "solo 1 cuenta en WHM",
      state.accounts.filter((a) => a.user === b4User).length === 1,
    );
    const b4Password = provision.initialPassword(b4.service.id, b4User);
    const b4Account = state.accounts.find((a) => a.user === b4User);
    check("la adoptada tiene la contraseña determinista", b4Account?.passwordSha256 === sha256(b4Password));
    const b4Mail = mailFor(EMAIL, b4User);
    check(
      "el correo tras adoptar trae la contraseña correcta",
      !!b4Mail && b4Mail.includes(`Contraseña inicial: ${b4Password}`),
    );
    const b4Events = await db.commerceEvent.findMany({
      where: { entityId: b4.service.id, action: "service.provisioned" },
    });
    check("evento con adopted=1", b4Events.some((e) => e.details.includes("adopted=1")));

    // ---- B5. Sin pago confirmado no se da de alta ----
    console.log("\n== B5. Sin pago no hay alta ==");
    const unpaid = await post("/api/account/orders", {
      cookie: customerCookie,
      body: { planId: "wh1", domain: D("e2e-b5"), idempotencyKey: `e2e-b5-${RUN}` },
    });
    check("pedido sin pago 200", unpaid.status === 200);
    const unpaidRow = await db.customerOrder.findUnique({
      where: { id: unpaid.value.id },
      include: { service: true },
    });
    check("sin servicio sin pago", !unpaidRow?.service);
    state = await stubState();
    check(
      "sin createacct para el pedido sin pago",
      createCallsFor(D("e2e-b5"), state).length === 0,
    );

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
