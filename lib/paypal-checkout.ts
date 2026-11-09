import { billingPolicy } from "./commerce";
import { db } from "./db";
import { MISSING_TAX_POLICY_ERROR } from "./money";
import {
  assertApprovalUrl,
  assertSandboxCertUrl,
  paypalAmountValue,
  paypalRuntime,
  PaypalSandboxError,
  PAYPAL_SANDBOX_ORIGIN,
} from "./paypal-sandbox";

export { PaypalSandboxError };

export type PaypalOrderView = {
  id: string;
  status: string;
  currency: string;
  value: string;
  customId: string;
  approveUrl: string;
};

export type PaypalCaptureView = {
  captureId: string;
  status: "COMPLETED" | "PENDING" | "DECLINED";
  currency: string;
  value: string;
};

export type WebhookVerifyInput = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  event: unknown;
};

export type PaypalGateway = {
  fixture: boolean;
  createOrder(input: { invoiceId: string; value: string; idempotencyKey: string; customId: string }): Promise<PaypalOrderView>;
  getOrder(id: string): Promise<PaypalOrderView>;
  captureOrder(id: string): Promise<PaypalCaptureView>;
  verifyWebhook(input: WebhookVerifyInput): Promise<"SUCCESS" | "FAILURE">;
};

type Send = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json: unknown }>;

function runtimeOrThrow() {
  const runtime = paypalRuntime();
  if (!runtime.ok && runtime.code === "live-rejected") {
    throw new PaypalSandboxError("La configuración apunta fuera del sandbox de PayPal. No se hace ninguna llamada.", 409, "live-rejected");
  }
  if (!runtime.ok && runtime.code === "fixture-forbidden") {
    throw new PaypalSandboxError("El simulador local no puede usarse en producción.", 409, "fixture-forbidden");
  }
  if (!runtime.ok) {
    throw new PaypalSandboxError("PayPal sandbox no está conectado. No se ha enviado ningún cobro.", 409, "unconfigured");
  }
  return runtime;
}

export function localFixtureGateway(): PaypalGateway {
  return {
    fixture: true,
    async createOrder(input) {
      const id = `FIX-${input.idempotencyKey}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
      const approveUrl = `/cuenta/paypal/simular?token=${encodeURIComponent(id)}`;
      assertApprovalUrl(approveUrl, true);
      return { id, status: "CREATED", currency: "USD", value: input.value, customId: input.customId, approveUrl };
    },
    async getOrder(id) {
      const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: id } });
      if (!row) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
      return {
        id,
        status: row.status === "denied" ? "VOIDED" : row.buyerApproved ? "APPROVED" : "CREATED",
        currency: row.currency,
        value: paypalAmountValue(row.amountCents),
        customId: row.invoiceId,
        approveUrl: row.approveUrl,
      };
    },
    async captureOrder(id) {
      const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: id } });
      if (!row) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
      if (row.status === "denied") {
        return { captureId: `CAP-${id}`, status: "DECLINED", currency: row.currency, value: paypalAmountValue(row.amountCents) };
      }
      if (!row.buyerApproved) {
        return { captureId: "", status: "PENDING", currency: row.currency, value: paypalAmountValue(row.amountCents) };
      }
      return { captureId: `CAP-${id}`, status: "COMPLETED", currency: row.currency, value: paypalAmountValue(row.amountCents) };
    },
    async verifyWebhook(input) {
      assertSandboxCertUrl(input.certUrl);
      if (input.webhookId !== (process.env.PAYPAL_SANDBOX_WEBHOOK_ID || "").trim()) return "FAILURE";
      return input.transmissionSig === "fixture-valid" ? "SUCCESS" : "FAILURE";
    },
  };
}

export async function sandboxSend(url: string, init: { method: string; headers: Record<string, string>; body?: string }, send: Send) {
  const { assertSandboxUrl } = await import("./paypal-sandbox");
  assertSandboxUrl(url);
  return send(url, init);
}

export function remoteSandboxGateway(env: NodeJS.ProcessEnv = process.env, send?: Send): PaypalGateway {
  const transport: Send = send ?? (async (url, init) => {
    const { assertSandboxUrl } = await import("./paypal-sandbox");
    assertSandboxUrl(url);
    const response = await fetch(url, init);
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
  });
  return {
    fixture: false,
    async createOrder(input) {
      const token = await sandboxAccessToken(env, transport);
      const created = await transport(`${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "paypal-request-id": input.idempotencyKey,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            custom_id: input.customId,
            amount: { currency_code: "USD", value: input.value },
          }],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: "CaluServers",
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
                return_url: returnUrl(env),
                cancel_url: cancelUrl(env),
              },
            },
          },
        }),
      });
      return parseOrder(created.json, false);
    },
    async getOrder(id) {
      const token = await sandboxAccessToken(env, transport);
      const loaded = await transport(`${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      });
      return parseOrder(loaded.json, false);
    },
    async captureOrder(id) {
      const token = await sandboxAccessToken(env, transport);
      const captured = await transport(`${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "paypal-request-id": `capture-${id}`,
        },
        body: "{}",
      });
      return parseCapture(captured.json);
    },
    async verifyWebhook(input) {
      assertSandboxCertUrl(input.certUrl);
      const token = await sandboxAccessToken(env, transport);
      const verified = await transport(`${PAYPAL_SANDBOX_ORIGIN}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          auth_algo: input.authAlgo,
          cert_url: input.certUrl,
          transmission_id: input.transmissionId,
          transmission_sig: input.transmissionSig,
          transmission_time: input.transmissionTime,
          webhook_id: input.webhookId,
          webhook_event: input.event,
        }),
      });
      const status = typeof verified.json === "object" && verified.json && "verification_status" in verified.json
        ? String((verified.json as { verification_status?: string }).verification_status)
        : "";
      return status === "SUCCESS" ? "SUCCESS" : "FAILURE";
    },
  };
}

async function sandboxAccessToken(env: NodeJS.ProcessEnv, transport: Send) {
  const id = (env.PAYPAL_SANDBOX_CLIENT_ID || "").trim();
  const secret = (env.PAYPAL_SANDBOX_CLIENT_SECRET || "").trim();
  if (!id || !secret) throw new PaypalSandboxError("PayPal sandbox no está conectado. No se ha enviado ningún cobro.", 409, "unconfigured");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const token = await transport(`${PAYPAL_SANDBOX_ORIGIN}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const access = typeof token.json === "object" && token.json && "access_token" in token.json
    ? String((token.json as { access_token?: string }).access_token || "")
    : "";
  if (!access) throw new PaypalSandboxError("PayPal sandbox no entregó un token de aplicación.", 502, "oauth");
  return access;
}

function returnUrl(env: NodeJS.ProcessEnv) {
  const site = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return `${site}/cuenta/paypal/retorno`;
}

function cancelUrl(env: NodeJS.ProcessEnv) {
  const site = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return `${site}/cuenta/paypal/cancelado`;
}

function parseOrder(json: unknown, fixture: boolean): PaypalOrderView {
  const order = json as { id?: string; status?: string; links?: { rel?: string; href?: string }[]; purchase_units?: { custom_id?: string; amount?: { currency_code?: string; value?: string } }[] };
  const unit = order.purchase_units?.[0];
  const link = order.links?.find((item) => item.rel === "payer-action")?.href || order.links?.find((item) => item.rel === "approve")?.href || "";
  if (!order.id || !link) throw new PaypalSandboxError("PayPal sandbox no devolvió un enlace de aprobación.", 502, "approval");
  assertApprovalUrl(link, fixture);
  return {
    id: order.id,
    status: order.status || "",
    currency: unit?.amount?.currency_code || "",
    value: unit?.amount?.value || "",
    customId: unit?.custom_id || "",
    approveUrl: link,
  };
}

function parseCapture(json: unknown): PaypalCaptureView {
  const order = json as { purchase_units?: { payments?: { captures?: { id?: string; status?: string; amount?: { currency_code?: string; value?: string } }[] } }[] };
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const status = capture?.status === "COMPLETED" || capture?.status === "PENDING" || capture?.status === "DECLINED" ? capture.status : "DECLINED";
  return {
    captureId: capture?.id || "",
    status,
    currency: capture?.amount?.currency_code || "",
    value: capture?.amount?.value || "",
  };
}

export function gatewayForEnv(): PaypalGateway {
  const runtime = runtimeOrThrow();
  return runtime.fixture ? localFixtureGateway() : remoteSandboxGateway();
}

function fiscalAllows(testFiscal: boolean) {
  if (testFiscal) return true;
  return billingPolicy().ok;
}

export async function createPaypalCheckout(input: { userId: string; invoiceId: string; idempotencyKey: string }) {
  const runtime = runtimeOrThrow();
  const gateway = runtime.fixture ? localFixtureGateway() : remoteSandboxGateway();
  const key = input.idempotencyKey.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new PaypalSandboxError("La clave de idempotencia no es válida.", 400, "idempotency");
  const invoice = await db.customerInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { payment: true, paypalCheckouts: true },
  });
  if (!invoice || invoice.userId !== input.userId) throw new PaypalSandboxError("Factura no encontrada.", 404, "missing");
  if (invoice.currency !== "USD") throw new PaypalSandboxError("La factura no está en USD.", 409, "currency");
  if (invoice.status === "void") throw new PaypalSandboxError("La factura está anulada.", 409, "void");
  if (invoice.payment?.status === "confirmed" || invoice.paypalCheckouts.some((item) => item.status === "captured")) {
    throw new PaypalSandboxError("Esa factura ya tiene un pago. No se inicia otro cobro.", 409, "duplicate");
  }
  if (!fiscalAllows(runtime.testFiscal)) throw new PaypalSandboxError(MISSING_TAX_POLICY_ERROR, 409, "fiscal");
  const sameKey = invoice.paypalCheckouts.find((item) => item.idempotencyKey === key);
  if (sameKey) return sameKey;
  const open = invoice.paypalCheckouts.find((item) => ["created", "approved", "capture_pending"].includes(item.status));
  if (open) return open;
  await db.$executeRaw`SELECT id FROM "CustomerInvoice" WHERE id = ${invoice.id} FOR UPDATE`;
  const locked = await db.paypalCheckout.findFirst({
    where: { invoiceId: invoice.id, status: { in: ["created", "approved", "capture_pending", "captured"] } },
  });
  if (locked?.status === "captured") throw new PaypalSandboxError("Esa factura ya tiene un pago de prueba capturado.", 409, "duplicate");
  if (locked) return locked;
  const value = paypalAmountValue(invoice.totalCents);
  let created: PaypalOrderView;
  try {
    created = await gateway.createOrder({ invoiceId: invoice.id, value, idempotencyKey: key, customId: invoice.id });
  } catch (error) {
    if (error instanceof PaypalSandboxError) throw error;
    throw new PaypalSandboxError("PayPal sandbox no respondió. No se ha registrado un cobro.", 503, "provider");
  }
  if (created.currency !== "USD" || created.value !== value || created.customId !== invoice.id) {
    throw new PaypalSandboxError("PayPal no confirmó el importe en USD de la factura.", 502, "mismatch");
  }
  try {
    return await db.paypalCheckout.create({
      data: {
        invoiceId: invoice.id,
        userId: input.userId,
        idempotencyKey: key,
        paypalOrderId: created.id,
        currency: "USD",
        amountCents: invoice.totalCents,
        status: "created",
        approveUrl: created.approveUrl,
        testFiscal: runtime.testFiscal && !billingPolicy().ok,
        buyerApproved: false,
      },
    });
  } catch {
    const again = await db.paypalCheckout.findUnique({ where: { idempotencyKey: key } });
    if (again && again.userId === input.userId && again.invoiceId === invoice.id) return again;
    throw new PaypalSandboxError("No se pudo guardar el checkout de prueba.", 503, "database");
  }
}

export async function markFixtureApproval(input: { userId: string; paypalOrderId: string; result: "approved" | "denied" | "cancelled" }) {
  const runtime = runtimeOrThrow();
  if (!runtime.fixture) throw new PaypalSandboxError("La aprobación simulada solo existe en el modo de pruebas local.", 409, "fixture-forbidden");
  const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: input.paypalOrderId } });
  if (!row || row.userId !== input.userId) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
  if (row.status === "captured") return row;
  const status = input.result === "approved" ? "approved" : input.result === "denied" ? "denied" : "cancelled";
  return db.paypalCheckout.update({
    where: { id: row.id },
    data: { buyerApproved: input.result === "approved", status },
  });
}

async function settleCapture(checkoutId: string, capture: PaypalCaptureView) {
  return db.$transaction(async (tx) => {
    const current = await tx.paypalCheckout.findUnique({
      where: { id: checkoutId },
      include: { invoice: { include: { order: true, payment: true } } },
    });
    if (!current) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
    await tx.$executeRaw`SELECT id FROM "CustomerInvoice" WHERE id = ${current.invoiceId} FOR UPDATE`;
    const fresh = await tx.paypalCheckout.findUnique({ where: { id: checkoutId } });
    if (!fresh) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
    if (fresh.status === "captured") return fresh;
    if (current.invoice.payment?.status === "confirmed") {
      throw new PaypalSandboxError("Esa factura ya tiene un pago manual. No se captura otro.", 409, "duplicate");
    }
    if (capture.currency !== "USD" || capture.value !== paypalAmountValue(fresh.amountCents)) {
      await tx.paypalCheckout.update({ where: { id: fresh.id }, data: { status: "failed" } });
      throw new PaypalSandboxError("El importe capturado no coincide con la factura.", 409, "mismatch");
    }
    if (capture.status === "DECLINED") {
      return tx.paypalCheckout.update({ where: { id: fresh.id }, data: { status: "denied" } });
    }
    if (capture.status === "PENDING") {
      return tx.paypalCheckout.update({ where: { id: fresh.id }, data: { status: "capture_pending" } });
    }
    if (!capture.captureId) throw new PaypalSandboxError("PayPal no entregó un identificador de captura.", 502, "capture");
    const updated = await tx.paypalCheckout.update({
      where: { id: fresh.id },
      data: { status: "captured", captureId: capture.captureId, buyerApproved: true },
    });
    const existingService = await tx.customerService.findUnique({ where: { orderId: current.invoice.orderId } });
    if (!existingService) {
      await tx.customerService.create({
        data: {
          userId: current.userId,
          orderId: current.invoice.orderId,
          planId: current.invoice.order.planId,
          planName: current.invoice.order.planName,
          status: "pending_provision",
          note: "Pago de prueba PayPal capturado en sandbox. No es dinero real. El servicio no se activa solo y no llama a WHM.",
        },
      });
    }
    await tx.commerceEvent.create({
      data: {
        actor: current.userId,
        action: "paypal.sandbox.captured",
        entityId: updated.id,
        details: `invoice=${current.invoiceId};cents=${fresh.amountCents};currency=USD;testFiscal=${fresh.testFiscal}`,
      },
    });
    return updated;
  });
}

export async function confirmPaypalCheckout(input: { userId: string; paypalOrderId: string }) {
  const runtime = runtimeOrThrow();
  const gateway = runtime.fixture ? localFixtureGateway() : remoteSandboxGateway();
  const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: input.paypalOrderId } });
  if (!row || row.userId !== input.userId) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
  if (row.status === "captured") return row;
  let remote: PaypalOrderView;
  let capture: PaypalCaptureView;
  try {
    remote = await gateway.getOrder(row.paypalOrderId);
    if (remote.customId !== row.invoiceId || remote.currency !== "USD" || remote.value !== paypalAmountValue(row.amountCents)) {
      throw new PaypalSandboxError("El recurso de PayPal no coincide con la factura.", 409, "mismatch");
    }
    if (remote.status !== "APPROVED" && remote.status !== "COMPLETED") {
      return db.paypalCheckout.update({ where: { id: row.id }, data: { status: remote.status === "VOIDED" ? "denied" : "capture_pending" } });
    }
    capture = await gateway.captureOrder(row.paypalOrderId);
  } catch (error) {
    if (error instanceof PaypalSandboxError) throw error;
    throw new PaypalSandboxError("PayPal sandbox no respondió. El pago no queda confirmado.", 503, "provider");
  }
  try {
    return await settleCapture(row.id, capture);
  } catch (error) {
    const current = await db.paypalCheckout.findUnique({ where: { id: row.id } });
    if (current?.status === "captured") return current;
    throw error;
  }
}

export async function cancelPaypalCheckout(input: { userId: string; paypalOrderId: string }) {
  const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: input.paypalOrderId } });
  if (!row || row.userId !== input.userId) throw new PaypalSandboxError("Pedido sandbox no encontrado.", 404, "missing");
  if (row.status === "captured") return row;
  return db.paypalCheckout.update({ where: { id: row.id }, data: { status: "cancelled" } });
}

type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: { custom_id?: string; amount?: { currency_code?: string; value?: string } }[];
  };
};

export async function ingestPaypalWebhook(input: {
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  authAlgo: string;
  certUrl: string;
  event: unknown;
}) {
  const runtime = runtimeOrThrow();
  const gateway = runtime.fixture ? localFixtureGateway() : remoteSandboxGateway();
  const webhookId = (process.env.PAYPAL_SANDBOX_WEBHOOK_ID || "").trim();
  if (!webhookId) throw new PaypalSandboxError("Falta PAYPAL_SANDBOX_WEBHOOK_ID. El webhook no se acepta.", 401, "webhook");
  let verdict: "SUCCESS" | "FAILURE" = "FAILURE";
  try {
    verdict = await gateway.verifyWebhook({ ...input, webhookId, event: input.event });
  } catch (error) {
    if (error instanceof PaypalSandboxError) throw error;
    throw new PaypalSandboxError("No se pudo verificar la firma del webhook.", 401, "webhook");
  }
  if (verdict !== "SUCCESS") throw new PaypalSandboxError("La firma del webhook no es válida.", 401, "webhook");
  const event = input.event as WebhookEvent;
  const eventId = (event.id || "").trim();
  const eventType = (event.event_type || "").trim();
  if (!eventId || !input.transmissionId) throw new PaypalSandboxError("El evento no trae identificador.", 400, "webhook");
  try {
    await db.paypalEvent.create({
      data: { eventId, transmissionId: input.transmissionId, eventType, outcome: "received" },
    });
  } catch {
    return { duplicate: true as const };
  }
  try {
    await applyWebhookEvent(event);
    await db.paypalEvent.update({ where: { eventId }, data: { outcome: "applied" } });
    return { duplicate: false as const };
  } catch (error) {
    const code = error instanceof PaypalSandboxError ? error.code : "failed";
    await db.paypalEvent.update({ where: { eventId }, data: { outcome: code } }).catch(() => undefined);
    if (error instanceof PaypalSandboxError && (error.code === "mismatch" || error.code === "missing")) return { duplicate: false as const };
    throw error;
  }
}

async function applyWebhookEvent(event: WebhookEvent) {
  const type = event.event_type || "";
  const resource = event.resource || {};
  const orderId = resource.supplementary_data?.related_ids?.order_id || resource.id || "";
  if (type === "CHECKOUT.ORDER.APPROVED") {
    const unit = resource.purchase_units?.[0];
    const row = await db.paypalCheckout.findUnique({ where: { paypalOrderId: resource.id || "" } });
    if (!row) return;
    if (unit?.amount?.currency_code !== "USD" || unit.amount.value !== paypalAmountValue(row.amountCents) || unit.custom_id !== row.invoiceId) {
      throw new PaypalSandboxError("El evento no coincide con la factura.", 409, "mismatch");
    }
    if (row.status === "captured") return;
    await db.paypalCheckout.update({ where: { id: row.id }, data: { buyerApproved: true, status: "approved" } });
    await confirmPaypalCheckout({ userId: row.userId, paypalOrderId: row.paypalOrderId });
    return;
  }
  if (type === "PAYMENT.CAPTURE.DENIED") {
    const row = orderId ? await db.paypalCheckout.findUnique({ where: { paypalOrderId: orderId } }) : null;
    if (!row || row.status === "captured") return;
    await db.paypalCheckout.update({ where: { id: row.id }, data: { status: "denied" } });
    return;
  }
  if (type === "PAYMENT.CAPTURE.PENDING") {
    const row = orderId ? await db.paypalCheckout.findUnique({ where: { paypalOrderId: orderId } }) : null;
    if (!row || row.status === "captured") return;
    await db.paypalCheckout.update({ where: { id: row.id }, data: { status: "capture_pending" } });
    return;
  }
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const row = orderId ? await db.paypalCheckout.findUnique({ where: { paypalOrderId: orderId } }) : null;
    if (!row) return;
    if (resource.custom_id && resource.custom_id !== row.invoiceId) {
      throw new PaypalSandboxError("El evento no coincide con la factura.", 409, "mismatch");
    }
    await settleCapture(row.id, {
      captureId: resource.id || "",
      status: "COMPLETED",
      currency: resource.amount?.currency_code || "",
      value: resource.amount?.value || "",
    });
  }
}
