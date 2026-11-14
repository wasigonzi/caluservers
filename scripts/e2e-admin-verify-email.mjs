// Verificación end-to-end REAL de "Marcar correo como verificado" (admin).
// Arranca el servidor Next real (dev) y la base Postgres de pruebas, y
// comprueba por HTTP: registro sin verificar -> login bloqueado -> el admin
// marca verificado -> login del cliente funciona. NUNCA toca WHM real,
// proveedor real ni la base de producción. No se envía ningún correo.
//
// Uso (desde la raíz del repo):
//   DATABASE_URL=postgresql://e2e:<clave>@127.0.0.1:5432/postgres \
//   node --import tsx scripts/e2e-admin-verify-email.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
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

const RUN = randomBytes(2).toString("hex");
const EMAIL = `verify-${RUN}@prueba.test`;
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

function cookiesOf(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function post(path, { cookie = "", body = null, origin = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: BASE } : {}),
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

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio");
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });

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
    console.log("== Preflight OK: Next + BD de pruebas ==");

    // ---- C1. Registro del cliente: queda sin verificar ----
    console.log("\n== C1. Registro sin verificar ==");
    const signup = await post("/api/auth/sign-up/email", {
      body: { name: "Cliente Verificar", email: EMAIL, password: CUSTOMER_PASSWORD },
    });
    check("registro 200", signup.status === 200, `status ${signup.status}`);
    const user = await db.user.findUnique({ where: { email: EMAIL } });
    check("usuario creado en BD", !!user);
    check("emailVerified=false", user?.emailVerified === false);
    const userId = user.id;

    // ---- C2. Login del cliente bloqueado antes de verificar ----
    console.log("\n== C2. Login bloqueado sin verificar ==");
    const blocked = await post("/api/auth/sign-in/email", {
      body: { email: EMAIL, password: CUSTOMER_PASSWORD },
    });
    check("login bloqueado (no 200)", blocked.status !== 200, `status ${blocked.status}`);

    // ---- C3. El admin ve el botón en la ficha del cliente ----
    console.log("\n== C3. Ficha del cliente en el admin ==");
    const adminLogin = await post("/api/admin/login", {
      body: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });
    check("login admin 200", adminLogin.status === 200, `status ${adminLogin.status}`);
    const adminCookie = adminLogin.cookie;
    check("sesión de admin", !!adminCookie);
    const detailBefore = await get(`/admin/clientes/${userId}`, adminCookie);
    check("ficha 200", detailBefore.status === 200, `status ${detailBefore.status}`);
    check("muestra 'Sin verificar'", detailBefore.text.includes("Sin verificar"));
    check(
      "muestra el botón",
      detailBefore.text.includes("Marcar correo como verificado"),
    );

    // ---- C4. El admin marca verificado ----
    console.log("\n== C4. Acción verify-email ==");
    const verify = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: { action: "verify-email", userId },
    });
    check("verify-email 200", verify.status === 200, `status ${verify.status}`);
    check("devuelve emailVerified=true", verify.value?.emailVerified === true);
    check("devuelve el correo", verify.value?.email === EMAIL);
    const after = await db.user.findUnique({ where: { id: userId } });
    check("BD emailVerified=true", after?.emailVerified === true);
    const audit = await db.adminAudit.findMany({
      where: { action: "customer.email.verified", entityId: userId },
    });
    check("constancia en AdminAudit", audit.length === 1, `${audit.length} entradas`);
    check("la constancia cita al admin", audit[0]?.details?.includes(E2E_EMAIL) ?? false);
    check("la constancia cita al cliente", audit[0]?.details?.includes(EMAIL) ?? false);

    // ---- C5. La ficha ya no ofrece el botón ----
    console.log("\n== C5. Ficha tras verificar ==");
    const detailAfter = await get(`/admin/clientes/${userId}`, adminCookie);
    check("ficha 200", detailAfter.status === 200, `status ${detailAfter.status}`);
    check("muestra 'Verificado'", detailAfter.text.includes("Verificado"));
    check(
      "ya no muestra el botón",
      !detailAfter.text.includes("Marcar correo como verificado"),
    );

    // ---- C6. El cliente ya puede entrar ----
    console.log("\n== C6. Login del cliente tras verificar ==");
    const signin = await post("/api/auth/sign-in/email", {
      body: { email: EMAIL, password: CUSTOMER_PASSWORD },
    });
    check("login cliente 200", signin.status === 200, `status ${signin.status}`);
    check("sesión de cliente", !!signin.cookie);

    // ---- C7. Rechazos ----
    console.log("\n== C7. Rechazos ==");
    const unknown = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: { action: "verify-email", userId: "no-existe" },
    });
    check("usuario desconocido 404", unknown.status === 404, `status ${unknown.status}`);
    check(
      "mensaje en español",
      unknown.value?.error === "Cliente no encontrado.",
      JSON.stringify(unknown.value),
    );
    const noUser = await post("/api/admin/commerce", {
      cookie: adminCookie,
      body: { action: "verify-email" },
    });
    check("sin userId 400", noUser.status === 400, `status ${noUser.status}`);
    const noCookie = await post("/api/admin/commerce", {
      body: { action: "verify-email", userId },
    });
    check("sin sesión 401", noCookie.status === 401, `status ${noCookie.status}`);
    const clientCookie = signin.cookie;
    const asClient = await post("/api/admin/commerce", {
      cookie: clientCookie,
      body: { action: "verify-email", userId },
    });
    check("cliente no-admin 401", asClient.status === 401, `status ${asClient.status}`);

    console.log(`\n== Resultado: ${failures === 0 ? "TODO OK" : `${failures} fallos`} ==`);
  } finally {
    server.kill();
    await db.$disconnect();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E falló:", error);
  process.exit(1);
});
