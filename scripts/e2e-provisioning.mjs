// Verificación end-to-end REAL del flujo compra -> pago -> creación WHM.
// Arranca el stub WHM local, habla por HTTP con el servidor Next real
// (dev) y una base Postgres de pruebas, y comprueba estados, idempotencia,
// fallo y reintento. NUNCA toca WHM real, proveedor real ni la base de
// producción. Las contraseñas generadas NUNCA se imprimen: solo se
// comprueba su forma (longitud/clases) tras descifrarlas de la base.
//
// Uso:
//   BASE_URL=http://127.0.0.1:3000 STUB_PORT=18087 \
//   ADMIN_EMAIL=admin@e2e.test ADMIN_PASSWORD=<clave de prueba> \
//   PAYMENT_WEBHOOK_SECRET=<secreto de prueba> \
//   DATABASE_URL=postgresql://... SETTINGS_ENCRYPTION_KEY=<64 hex> \
//   node scripts/e2e-provisioning.mjs
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const STUB_PORT = process.env.STUB_PORT || "18087";
const STUB = `http://127.0.0.1:${STUB_PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

const db = new PrismaClient();
const RUN = randomBytes(2).toString("hex"); // dominios únicos por corrida
const D = (base) => `${base}-${RUN}.com`;
// Misma regla que deriveWhmUsernameBase (lib/provisioning.ts).
function expectedUsername(domain) {
  const sld = domain.replace(/\.[^.]+$/, "").toLowerCase();
  let base = sld.replace(/[^a-z0-9]/g, "");
  base = base.replace(/^[^a-z]+/, "");
  if (base.startsWith("test")) base = `h${base}`;
  if (!base) base = "hosting";
  return base.slice(0, 16);
}
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
function assertShape(name, cond) {
  check(name, cond);
}

async function waitFor(fn, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
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

async function checkout(domain, email) {
  const res = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: "wh1",
      domain,
      customerName: "Cliente E2E",
      customerEmail: email,
    }),
  });
  const value = await res.json().catch(() => null);
  return { status: res.status, value };
}

async function webhook(number, ref) {
  const raw = JSON.stringify({
    orderNumber: number,
    paymentRef: ref,
    status: "paid",
  });
  const sig =
    "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-caluservers-signature": sig,
    },
    body: raw,
  });
  return { status: res.status, value: await res.json().catch(() => null) };
}

async function adminLogin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`admin login: ${res.status}`);
  const cookie = res.headers.get("set-cookie") || "";
  return cookie.split(";")[0];
}

async function adminAction(cookie, orderId, action) {
  const res = await fetch(`${BASE}/api/admin/orders/${orderId}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Cookie: cookie,
    },
    body: JSON.stringify({}),
  });
  return { status: res.status, value: await res.json().catch(() => null) };
}

async function orderByNumber(number) {
  return db.order.findUnique({
    where: { number },
    include: { hostingAccount: true },
  });
}

// --- Cargador VM del motor real (misma técnica que tests/provisioning.test.mjs),
// con la BD REAL de pruebas (no se mockea @/lib/db) y el proceso real.
function loadProvisioningReal() {
  const cache = new Map();
  function load(name) {
    const file = resolve(root, name);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(id) {
      if (id === "server-only") return {};
      if (id.startsWith("@/") || id.startsWith(".")) {
        let path = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(file), id);
        if (!existsSync(path))
          path += existsSync(path + ".ts") ? ".ts" : ".tsx";
        return load(path);
      }
      return require(id);
    }
    runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        require: localRequire,
        URL,
        URLSearchParams,
        Buffer,
        structuredClone,
        console,
        setTimeout,
        clearTimeout,
        process,
      },
      { filename: file },
    );
    return module.exports;
  }
  const provisioning = load("lib/provisioning.ts");
  const { WhmError } = load("lib/whm-security.ts");
  return { provisioning, WhmError };
}

// Adaptador WHM de prueba: envía el MISMO payload que writeWhm
// (POST /json-api/createacct, api.version=1, showpass=n, forcedns=0,
// reseller=0, savepkg=0) al stub local y valida la respuesta como WHM.
function stubAdapter(WhmError) {
  return {
    async createAccount(input) {
      const body = new URLSearchParams({
        "api.version": "1",
        username: input.username,
        domain: input.domain,
        password: input.password,
        plan: input.plan,
        showpass: "n",
        forcedns: "0",
        reseller: "0",
        savepkg: "0",
      }).toString();
      const res = await fetch(`${STUB}/json-api/createacct`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const value = await res.json();
      if (value?.metadata?.result !== 1) {
        const reason = String(value?.metadata?.reason ?? "");
        if (/already exists/i.test(reason)) throw new WhmError("conflict");
        throw new WhmError("rejected");
      }
    },
    async findAccount(username) {
      const res = await fetch(`${STUB}/json-api/listaccts`);
      const value = await res.json();
      const row = (value?.data?.acct ?? []).find((r) => r.user === username);
      return row ? { domain: row.domain } : null;
    },
  };
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !WEBHOOK_SECRET)
    throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD / PAYMENT_WEBHOOK_SECRET");
  if (!process.env.DATABASE_URL || !process.env.SETTINGS_ENCRYPTION_KEY)
    throw new Error("Faltan DATABASE_URL / SETTINGS_ENCRYPTION_KEY");

  const stub = spawn(
    process.execPath,
    [resolve(root, "scripts/stub-whm-server.mjs")],
    { env: { ...process.env, STUB_PORT }, stdio: ["ignore", "pipe", "pipe"] },
  );
  stub.stdout.on("data", (d) => process.stdout.write(`[stub] ${d}`));
  stub.stderr.on("data", (d) => process.stderr.write(`[stub:err] ${d}`));

  try {
    await waitFor(async () => {
      try {
        await stubCall("/__test__/calls");
        return true;
      } catch {
        return false;
      }
    }, "stub WHM");
    await waitFor(async () => {
      const res = await fetch(`${BASE}/`);
      return res.ok;
    }, "servidor Next");
    await db.$queryRaw`SELECT 1`;
    // Limpieza de corridas anteriores en la BD de pruebas (solo e2e-*).
    await db.hostingAccount.deleteMany({
      where: { order: { customerEmail: { startsWith: "e2e-" } } },
    });
    await db.order.deleteMany({
      where: { customerEmail: { startsWith: "e2e-" } },
    });
    await stubCall("/__test__/reset", "POST");
    console.log("== Preflight OK: stub WHM + Next + BD de pruebas ==");

    // ---- 1. Checkout real (HTTP) -> pedido pendiente ----
    console.log("\n== 1. Checkout real ==");
    const a = await checkout(D("e2e-cliente"), "e2e-a@prueba.test");
    check("checkout 201", a.status === 201, `status ${a.status}`);
    const numA = a.value?.number;
    check("número CS-XXXXXXXX", /^CS-[0-9A-F]{8}$/.test(numA ?? ""), numA);
    let orderA = await orderByNumber(numA);
    check("pedido en BD pending_payment", orderA?.status === "pending_payment");
    check("sin cuenta WHM todavía", !orderA?.whmUsername);

    // ---- 2. Webhook real con HMAC -> sin WHM configurado: provision_failed ----
    console.log("\n== 2. Webhook real (HMAC) sin WHM configurado ==");
    const w1 = await webhook(numA, "PAY-E2E-1");
    check("webhook 200", w1.status === 200, `status ${w1.status}`);
    check(
      "webhook reporta provision_failed",
      w1.value?.status === "provision_failed",
      w1.value?.status,
    );
    orderA = await orderByNumber(numA);
    check("pedido provision_failed", orderA?.status === "provision_failed");
    check("error guardado", !!orderA?.provisionError, orderA?.provisionError);
    check("intentos = 1", orderA?.provisionAttempts === 1);

    // ---- 3. Webhook duplicado: idempotente ----
    console.log("\n== 3. Webhook duplicado ==");
    const w2 = await webhook(numA, "PAY-E2E-1");
    check("webhook duplicado 200", w2.status === 200);
    check("alreadyConfirmed", w2.value?.alreadyConfirmed === true);
    orderA = await orderByNumber(numA);
    check("intentos siguen en 1", orderA?.provisionAttempts === 1);

    // ---- 4. Admin: retry real (HTTP) sigue fallando sin WHM ----
    console.log("\n== 4. Admin retry real (HTTP) ==");
    const cookie = await adminLogin();
    check("login admin OK", !!cookie);
    const r1 = await adminAction(cookie, orderA.id, "retry");
    check("retry 200", r1.status === 200, `status ${r1.status}`);
    orderA = await orderByNumber(numA);
    check("sigue provision_failed", orderA?.status === "provision_failed");
    check("intentos = 2", orderA?.provisionAttempts === 2);

    // ---- 5. Admin: confirm-payment real (HTTP) en pedido nuevo ----
    console.log("\n== 5. Admin confirm-payment real (HTTP) ==");
    const b = await checkout(D("e2e-dos"), "e2e-b@prueba.test");
    check("checkout B 201", b.status === 201);
    const numB = b.value?.number;
    let orderB = await orderByNumber(numB);
    const c1 = await adminAction(cookie, orderB.id, "confirm-payment");
    check("confirm-payment 200", c1.status === 200, `status ${c1.status}`);
    orderB = await orderByNumber(numB);
    check(
      "B provision_failed (sin WHM real)",
      orderB?.status === "provision_failed",
    );
    check("B pago confirmado", !!orderB?.paidAt, orderB?.paidAt?.toISOString());

    // ---- 6. Motor real + stub WHM: éxito end-to-end ----
    console.log("\n== 6. Motor real + stub WHM (éxito) ==");
    const { provisioning, WhmError } = loadProvisioningReal();
    const whm = stubAdapter(WhmError);
    const deps = { store: provisioning.prismaOrderStore, whm };
    const c = await checkout(D("e2e-tres"), "e2e-c@prueba.test");
    check("checkout C 201", c.status === 201);
    const numC = c.value?.number;
    let orderC = await orderByNumber(numC);
    const ok = await provisioning.confirmPayment(
      orderC.id,
      { paymentRef: "PAY-E2E-C", paidVia: "admin" },
      deps,
    );
    const userC = expectedUsername(D("e2e-tres"));
    check("confirmPayment provisioned", ok.provisioned === true);
    check("pedido C activo", ok.order.status === "active");
    check(`usuario WHM ${userC}`, ok.order.whmUsername === userC);
    const stubState = await stubCall("/__test__/calls");
    const calls = stubState.calls.filter(
      (x) => x.path === "/json-api/createacct",
    );
    check("stub recibió 1 createacct", calls.length === 1, `${calls.length}`);
    check(
      `createacct: username ${userC}`,
      calls[0]?.params?.username === userC,
    );
    check(
      `createacct: domain ${D("e2e-tres")}`,
      calls[0]?.params?.domain === D("e2e-tres"),
    );
    check(
      "createacct: plan Calu Professional",
      calls[0]?.params?.plan === "Calu Professional",
    );
    check(
      "createacct: api.version=1",
      calls[0]?.params?.["api.version"] === "1",
    );
    orderC = await orderByNumber(numC);
    const accountC = orderC?.hostingAccount;
    check("HostingAccount creada", !!accountC);
    check(
      "cuenta en stub WHM",
      stubState.accounts.some((a2) => a2.user === userC),
    );
    if (accountC) {
      const plain = provisioning.decryptProvisioningSecret(
        accountC.encryptedPassword,
      );
      assertShape("contraseña 20 chars", plain.length === 20);
      assertShape("contraseña con 4 clases", /[a-z]/.test(plain) && /[A-Z]/.test(plain) && /[0-9]/.test(plain) && /[!@#$%^&*+\-_=]/.test(plain));
      check(
        "contraseña cifrada en BD (no en claro)",
        accountC.encryptedPassword !== plain,
      );
    }
    const track = await fetch(`${BASE}/pedido/${c.value.lookupToken}`);
    const trackHtml = await track.text();
    check("seguimiento 200", track.status === 200);
    check(
      "seguimiento muestra 'Cuenta activa'",
      trackHtml.includes("Cuenta activa"),
    );
    check("seguimiento muestra usuario", trackHtml.includes(userC));

    // ---- 7. Idempotencia del motor real ----
    console.log("\n== 7. Idempotencia (motor real) ==");
    const again = await provisioning.provisionOrder(orderC.id, deps);
    check("re-aprovisionar no-op", again.alreadyInFlight === true);
    const again2 = await provisioning.confirmPayment(
      orderC.id,
      { paymentRef: "PAY-E2E-C", paidVia: "admin" },
      deps,
    );
    check("re-confirmar no-op", again2.alreadyConfirmed === true);
    const stubState2 = await stubCall("/__test__/calls");
    check(
      "stub sigue con 1 createacct",
      stubState2.calls.filter((x) => x.path === "/json-api/createacct")
        .length === 1,
    );

    // ---- 8. Caso incierto: respuesta perdida -> reintento adopta ----
    console.log("\n== 8. Respuesta WHM perdida -> adopta al reintentar ==");
    const d = await checkout(D("e2e-cuatro"), "e2e-d@prueba.test");
    const numD = d.value?.number;
    let orderD = await orderByNumber(numD);
    await stubCall("/__test__/mode", "POST", { dropCreate: true });
    const lost = await provisioning.confirmPayment(
      orderD.id,
      { paymentRef: "PAY-E2E-D", paidVia: "admin" },
      deps,
    );
    check("respuesta perdida -> no provisioned", lost.provisioned === false);
    check(
      "pedido D provision_failed",
      lost.order.status === "provision_failed",
    );
    await stubCall("/__test__/mode", "POST", { dropCreate: false });
    const userD = expectedUsername(D("e2e-cuatro"));
    const adopted = await provisioning.retryProvisioning(orderD.id, deps);
    check("reintento adopta", adopted.ok === true);
    check("pedido D activo", adopted.order.status === "active");
    check(`usuario ${userD}`, adopted.order.whmUsername === userD);
    const stubState3 = await stubCall("/__test__/calls");
    const dAccounts = stubState3.accounts.filter(
      (a2) => a2.user === userD,
    );
    check(`solo 1 cuenta ${userD} en stub`, dAccounts.length === 1);
    check(
      "createacct de D = 2 intentos, 1 cuenta",
      stubState3.calls.filter(
        (x) =>
          x.path === "/json-api/createacct" &&
          x.params.username === userD,
      ).length === 2,
    );

    // ---- 9. Fallo WHM -> provision_failed -> reintento OK ----
    console.log("\n== 9. Fallo WHM -> reintento OK ==");
    const e = await checkout(D("e2e-cinco"), "e2e-e@prueba.test");
    const numE = e.value?.number;
    let orderE = await orderByNumber(numE);
    await stubCall("/__test__/mode", "POST", {
      failCreate: true,
      failReason: "Simulated WHM failure",
    });
    const failed = await provisioning.confirmPayment(
      orderE.id,
      { paymentRef: "PAY-E2E-E", paidVia: "admin" },
      deps,
    );
    check("fallo -> no provisioned", failed.provisioned === false);
    check(
      "pedido E provision_failed",
      failed.order.status === "provision_failed",
    );
    check("error visible en BD", !!failed.order.provisionError);
    await stubCall("/__test__/mode", "POST", { failCreate: false });
    const retried = await provisioning.retryProvisioning(orderE.id, deps);
    check("reintento OK", retried.ok === true);
    check("pedido E activo", retried.order.status === "active");

    // ---- Resumen de evidencia ----
    console.log("\n== Resumen ==");
    const all = await db.order.findMany({
      where: { customerEmail: { startsWith: "e2e-" } },
      orderBy: { createdAt: "asc" },
      select: {
        number: true,
        domain: true,
        status: true,
        whmUsername: true,
        provisionAttempts: true,
      },
    });
    console.log(JSON.stringify({ orders: all, stubCalls: (await stubCall("/__test__/calls")).calls }, null, 2));
    console.log(
      failures === 0
        ? "\nE2E OK: el flujo compra -> pago -> creación WHM funciona."
        : `\nE2E FALLÓ: ${failures} comprobación(es) fallaron.`,
    );
  } finally {
    stub.kill();
    await db.$disconnect();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E ERROR:", err);
  process.exit(1);
});
