// Sin verificación de correo: el cliente entra y contrata al registrarse.
// - POST /api/account/orders, /tickets y /paypal aceptan sesiones sin
//   emailVerified (antes 401); sin sesión siguen exigiendo entrar (401).
// - La acción de admin "verify-email" ya no existe (400).
// - markEmailVerified ya no existe en lib/commerce.ts.
// - Los textos de verificación desaparecieron del auth y de los formularios.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loader, root } from "./helpers/load.mjs";
import { resolve } from "node:path";

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status;
  }
  async json() {
    return this.body;
  }
}

const nextServer = {
  NextResponse: class {
    static json(data, init) {
      return new FakeResponse(data, init?.status ?? 200);
    }
  },
  NextRequest: class {},
};

function fakeReq(body) {
  return { json: async () => body, headers: { get: () => null } };
}

function unverifiedSession() {
  return { user: { id: "user-1", email: "cliente@example.com", emailVerified: false } };
}

class CommerceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

test("el pedido se crea con una sesión sin correo verificado (ya no 401)", async () => {
  const h = loader({
    "@/lib/customer-session": { customerSession: async () => unverifiedSession() },
    "@/lib/commerce": {
      CommerceError,
      createCustomerOrder: async () => ({
        id: "ord-1",
        totalCents: 399,
        currency: "USD",
        invoice: { id: "inv-1" },
      }),
    },
    "@/lib/request": { trustedWrite: () => true },
    "next/server": nextServer,
  });
  const route = h.load("app/api/account/orders/route.ts");
  const res = await route.POST(
    fakeReq({ planId: "wh0", idempotencyKey: "ord_test1234", domain: "prueba.test" }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, "ord-1");
});

test("el pedido sin sesión sigue exigiendo entrar (401)", async () => {
  const h = loader({
    "@/lib/customer-session": { customerSession: async () => null },
    "@/lib/commerce": { CommerceError, createCustomerOrder: async () => ({}) },
    "@/lib/request": { trustedWrite: () => true },
    "next/server": nextServer,
  });
  const route = h.load("app/api/account/orders/route.ts");
  const res = await route.POST(
    fakeReq({ planId: "wh0", idempotencyKey: "ord_test1234", domain: "prueba.test" }),
  );
  assert.equal(res.status, 401);
});

test("el ticket se abre con una sesión sin correo verificado (ya no 401)", async () => {
  const h = loader({
    "@/lib/customer-session": { customerSession: async () => unverifiedSession() },
    "@/lib/commerce": {
      CommerceError,
      createTicket: async () => ({ id: "tick-1" }),
      replyTicket: async () => ({ id: "msg-1" }),
    },
    "@/lib/ticket-notify": { notifyStaffOfTicket: async () => {} },
    "@/lib/request": { trustedWrite: () => true },
    "next/server": nextServer,
  });
  const route = h.load("app/api/account/tickets/route.ts");
  const res = await route.POST(fakeReq({ subject: "Ayuda con mi plan", body: "No veo mi servicio." }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, "tick-1");
});

test("el cobro con una sesión sin verificar llega al chequeo de PayPal (ya no 401)", async () => {
  const h = loader({
    "@/lib/customer-session": { customerSession: async () => unverifiedSession() },
    "@/lib/paypal": {
      paypalReady: () => false,
      PaypalError: class PaypalError extends Error {},
    },
    "@/lib/paypal-checkout": {
      startPaypalCheckout: async () => ({}),
      finishPaypalCheckout: async () => ({}),
    },
    "@/lib/commerce": { CommerceError },
    "@/lib/request": { trustedWrite: () => true },
    "next/server": nextServer,
  });
  const route = h.load("app/api/account/paypal/route.ts");
  const res = await route.POST(fakeReq({ action: "start", invoiceId: "inv-1" }));
  // Sin PayPal configurado en el entorno de pruebas, la ruta llega al chequeo
  // de la pasarela (503) en vez de al bloqueo de verificación (401).
  assert.equal(res.status, 503);
});

test("la acción de admin verify-email ya no existe (400)", async () => {
  const h = loader({
    "./db": { db: {} },
    "@/lib/db": { db: {} },
    "next/server": nextServer,
    "@/lib/auth": { requireAdmin: async () => {} },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/ticket-notify": { notifyCustomerOfReply: async () => false },
    "@/lib/whm-security": {
      WhmError: class WhmError extends Error {},
      safeWhmError: () => ({ message: "whm", code: "x" }),
    },
    "@/lib/whm-provision": {
      maybeAutoProvision: async () => ({ provisioned: false }),
      ProvisionError: class ProvisionError extends Error {},
      provisionService: async () => ({}),
    },
  });
  const route = h.load("app/api/admin/commerce/route.ts");
  const res = await route.POST(fakeReq({ action: "verify-email", userId: "user-1" }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Acción no reconocida.");
});

test("markEmailVerified ya no existe en lib/commerce.ts", async () => {
  const h = loader({ "@/lib/db": { db: {} }, "./db": { db: {} } });
  const commerce = h.load("lib/commerce.ts");
  assert.equal(typeof commerce.markEmailVerified, "undefined");
  assert.equal(typeof commerce.createCustomerOrder, "function");
  assert.equal(typeof commerce.confirmManualPayment, "function");
});

test("la configuración de auth no exige ni envía verificación", () => {
  const auth = readFileSync(resolve(root, "lib/customer-auth.ts"), "utf8");
  assert.match(auth, /requireEmailVerification: false/);
  assert.doesNotMatch(auth, /sendVerificationEmail/);
  assert.doesNotMatch(auth, /sendOnSignUp/);
  assert.doesNotMatch(auth, /emailVerification:\s*\{/);
});

test("los formularios ya no hablan de verificación", () => {
  const forms = readFileSync(
    resolve(root, "components/account/AccountForms.tsx"),
    "utf8",
  );
  assert.doesNotMatch(forms, /Reenviar el enlace de verificación/);
  assert.doesNotMatch(forms, /Tu correo todavía no está verificado/);
  assert.doesNotMatch(forms, /Revisa el correo de verificación/);
  assert.match(forms, /Ya puedes usar tu cuenta/);
});

test("el botón de verificar del admin ya no existe en ningún sitio", () => {
  for (const file of [
    "components/admin/CommerceActions.tsx",
    "app/admin/clientes/[id]/page.tsx",
    "app/admin/clientes/page.tsx",
    "app/api/admin/commerce/route.ts",
    "lib/commerce.ts",
  ]) {
    const text = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(text, /VerifyEmailButton/);
    assert.doesNotMatch(text, /verify-email/);
    assert.doesNotMatch(text, /markEmailVerified/);
  }
  const mailer = readFileSync(resolve(root, "lib/mailer.ts"), "utf8");
  assert.doesNotMatch(mailer, /"verify"/);
});
