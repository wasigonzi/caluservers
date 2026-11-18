// Autorización por recurso del área de cliente (Fase 0).
// Revisión completa en el informe: todas las rutas de cliente filtran por el
// userId de la sesión; no se encontró ningún P0. Estas pruebas son la red de
// seguridad: con la base simulada, el cliente A no puede tocar recursos de B.
// Todos los ids, correos y hosts son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const ENV = {
  BILLING_CURRENCY: "USD",
  TAX_MODE: "none",
  NEXT_PUBLIC_SITE_URL: "https://caluservers.example",
};

const invoiceOwn = {
  id: "inv-own-12345678",
  userId: "user-a",
  number: "PF-OWN1234",
  totalCents: 1000,
  currency: "USD",
  status: "issued",
  taxMode: "none",
  taxCents: 0,
  payment: null,
  order: { planName: "Plan Básico" },
};
const invoiceOther = { ...invoiceOwn, id: "inv-other-12345678", userId: "user-b" };

function paypalDb() {
  return {
    customerInvoice: {
      findUnique: async ({ where }) => {
        if (where.id === invoiceOwn.id) return invoiceOwn;
        if (where.id === invoiceOther.id) return invoiceOther;
        return null;
      },
    },
    commerceEvent: { create: async () => ({ id: "evt-1" }) },
  };
}

function loadPaypalCheckout() {
  const client = paypalDb();
  const h = loader({
    "./db": { db: client },
    "@/lib/db": { db: client },
    "./paypal": {
      paypalReady: () => true,
      createPaypalOrder: async () => ({
        id: "pp-order-1",
        approveUrl: "https://paypal.example/approve",
      }),
      capturePaypalOrder: async () => ({}),
      PaypalError: class PaypalError extends Error {
        constructor(code) {
          super(code);
          this.code = code;
        }
      },
    },
    "./whm-provision": {
      maybeAutoProvision: async () => ({ provisioned: false, reason: "test" }),
    },
    env: ENV,
  });
  // Mismo loader: paypal-checkout y commerce comparten la instancia del módulo.
  return { checkout: h.load("lib/paypal-checkout.ts"), commerce: h.load("lib/commerce.ts") };
}

test("cliente A no puede iniciar el pago de una factura de B: 404 idéntico a inexistente", async () => {
  const { checkout, commerce } = loadPaypalCheckout();
  await assert.rejects(
    () => checkout.startPaypalCheckout({ invoiceId: invoiceOther.id, userId: "user-a" }),
    (error) => {
      assert.ok(error instanceof commerce.CommerceError);
      assert.equal(error.status, 404);
      assert.equal(error.message, "Factura no encontrada.");
      return true;
    },
  );
  // La misma respuesta para una factura que no existe: no se distingue.
  await assert.rejects(
    () => checkout.startPaypalCheckout({ invoiceId: "inv-nada-12345678", userId: "user-a" }),
    (error) => {
      assert.ok(error instanceof commerce.CommerceError);
      assert.equal(error.status, 404);
      assert.equal(error.message, "Factura no encontrada.");
      return true;
    },
  );
});

test("cliente A sí puede iniciar el pago de su propia factura", async () => {
  const { checkout } = loadPaypalCheckout();
  const result = await checkout.startPaypalCheckout({
    invoiceId: invoiceOwn.id,
    userId: "user-a",
  });
  assert.equal(result.orderId, "pp-order-1");
  assert.equal(result.invoiceId, invoiceOwn.id);
});

test("cliente A no puede responder a un ticket de B: 403", async () => {
  const h = loader({
    "./db": {
      db: {
        supportTicket: {
          findUnique: async ({ where }) =>
            where.id === "ticket-b" ? { id: "ticket-b", userId: "user-b", status: "open" } : null,
        },
      },
    },
    env: ENV,
  });
  const commerce = h.load("lib/commerce.ts");
  await assert.rejects(
    () =>
      commerce.replyTicket({
        ticketId: "ticket-b",
        userId: "user-a",
        author: "customer",
        body: "Hola, soy A",
      }),
    (error) => {
      assert.ok(error instanceof commerce.CommerceError);
      assert.equal(error.status, 403);
      return true;
    },
  );
});
