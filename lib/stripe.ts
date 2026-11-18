import "server-only";
import Stripe from "stripe";
import {
  CommerceError,
  markPaymentRefunded,
  recordGatewayPayment,
} from "./commerce";
import { db } from "./db";
import { payableInvoice, siteOrigin } from "./paypal-checkout";
import { openSecret } from "./secret-box";

/**
 * Stripe (Checkout + Billing + webhooks). Cobro real de las facturas propias.
 *
 * - Credenciales por entorno (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
 *   o, si no hay entorno, por el plugin `stripe` en BD (fila `Plugin` con
 *   `secretRef` cifrado con secret-box, AAD `plugin:stripe:v1`). Sin clave
 *   no hay cliente: las rutas responden 503, no existe un modo de prueba
 *   que simule un cobro.
 * - El importe, la moneda y el dueño salen de la factura en BD, nunca del
 *   cliente. Lo único que viaja desde el navegador es el id de la factura y,
 *   en la vuelta, el id de sesión que Stripe puso en la URL.
 * - La firma del webhook se verifica con `stripe.webhooks.constructEvent`
 *   antes de registrar nada.
 */

const PLUGIN_AAD = "plugin:stripe:v1";

const MESSAGES = {
  unconfigured:
    "El cobro con Stripe no está configurado. Faltan las claves de la pasarela.",
  signature: "La notificación no superó la verificación de firma de Stripe.",
  upstream: "Stripe no completó la operación. No se registró ningún cobro.",
  mismatch: "El importe o la referencia de Stripe no coinciden con la factura.",
  charge_failed:
    "Stripe no pudo cobrar con el método guardado. La factura queda pendiente.",
} as const;

export class StripeError extends Error {
  constructor(readonly code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = "StripeError";
  }
}

type PluginSecrets = { secretKey?: string; webhookSecret?: string };

/**
 * Secretos del plugin `stripe` en BD. `secretRef` admite dos formas:
 * el secreto sellado directamente (solo la secret key) o un JSON con los
 * campos sellados `{ secretKey, webhookSecret }`. Un plugin desactivado
 * o sin secreto no aporta nada; el entorno siempre manda.
 */
async function pluginSecrets(): Promise<PluginSecrets> {
  try {
    const plugin = await db.plugin.findUnique({ where: { key: "stripe" } });
    if (!plugin?.enabled || !plugin.secretRef) return {};
    const raw = plugin.secretRef;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const out: PluginSecrets = {};
      if (typeof record.secretKey === "string") {
        try {
          out.secretKey = openSecret(PLUGIN_AAD, record.secretKey);
        } catch {
          // Secreto ilegible: se ignora, no se registra su valor.
        }
      }
      if (typeof record.webhookSecret === "string") {
        try {
          out.webhookSecret = openSecret(PLUGIN_AAD, record.webhookSecret);
        } catch {
          // Igual que arriba.
        }
      }
      return out;
    }
    try {
      return { secretKey: openSecret(PLUGIN_AAD, raw) };
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

export async function stripeSecretKey(): Promise<string | null> {
  const fromEnv = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const fromPlugin = await pluginSecrets();
  return fromPlugin.secretKey ?? null;
}

export async function stripeWebhookSecret(): Promise<string | null> {
  const fromEnv = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  const fromPlugin = await pluginSecrets();
  return fromPlugin.webhookSecret ?? null;
}

let cachedClient: { key: string; client: Stripe } | null = null;

export async function getStripeClient(): Promise<Stripe | null> {
  const key = await stripeSecretKey();
  if (!key) return null;
  if (cachedClient && cachedClient.key === key) return cachedClient.client;
  const client = new Stripe(key);
  cachedClient = { key, client };
  return client;
}

export async function stripeReady(): Promise<boolean> {
  return (await getStripeClient()) !== null;
}

/** Solo para pruebas: olvida el cliente guardado. */
export function resetStripeClient() {
  cachedClient = null;
}

/**
 * Abre el cobro con Stripe Checkout para una factura. Devuelve la URL a la
 * que el cliente tiene que ir; el cobro se cierra en la vuelta o por webhook.
 */
export async function startStripeCheckout(input: { invoiceId: string; userId: string }) {
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  const origin = siteOrigin();
  if (!origin) {
    throw new CommerceError(
      "Falta NEXT_PUBLIC_SITE_URL para volver del pago. No se abre el cobro sin una URL de retorno.",
      409,
    );
  }
  const invoice = await payableInvoice(input.invoiceId, input.userId);
  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.create({
      mode: "payment",
      currency: invoice.currency.toLowerCase(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: invoice.totalCents,
            product_data: { name: `${invoice.order.planName} · ${invoice.number}` },
          },
        },
      ],
      metadata: { invoice_id: invoice.id, invoice_number: invoice.number },
      success_url: `${origin}/cuenta/pago?invoice=${encodeURIComponent(invoice.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cuenta?pago=cancelado`,
    });
  } catch {
    throw new StripeError("upstream");
  }
  if (!session.url) throw new StripeError("upstream");
  await db.commerceEvent
    .create({
      data: {
        actor: input.userId,
        action: "payment.started",
        entityId: invoice.id,
        details: `provider=stripe;session=${session.id};cents=${invoice.totalCents}`,
      },
    })
    .catch(() => {
      // La traza no debe impedir el cobro; el pago queda registrado al capturar.
    });
  return { sessionId: session.id, url: session.url, invoiceId: invoice.id };
}

export type StripePayment = {
  providerRef: string;
  amountCents: number;
  currency: string;
  invoiceId: string;
};

/**
 * Extrae el cobro de un evento de Stripe. `checkout.session.completed`
 * trae la sesión de Checkout; `invoice.paid`, la factura de Stripe (cobros
 * de suscripción). Sin id de factura propia no hay cobro que registrar.
 */
export function readStripePayment(event: Stripe.Event): StripePayment | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  if (!object || typeof object !== "object") return null;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const invoiceId =
    typeof metadata.invoice_id === "string"
      ? metadata.invoice_id
      : typeof metadata.invoiceId === "string"
        ? metadata.invoiceId
        : null;
  if (!invoiceId) return null;
  if (event.type === "checkout.session.completed") {
    const amount = object.amount_total;
    const currency = object.currency;
    const intent = object.payment_intent;
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      typeof currency !== "string" ||
      typeof intent !== "string" ||
      !intent
    ) {
      return null;
    }
    return {
      providerRef: intent,
      amountCents: amount,
      currency: currency.toUpperCase(),
      invoiceId,
    };
  }
  if (event.type === "invoice.paid") {
    const amount = object.amount_paid;
    const currency = object.currency;
    const id = object.id;
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      typeof currency !== "string" ||
      typeof id !== "string" ||
      !id
    ) {
      return null;
    }
    return {
      providerRef: id,
      amountCents: amount,
      currency: currency.toUpperCase(),
      invoiceId,
    };
  }
  return null;
}

export type StripeSubscriptionUpdate = {
  gatewaySubscriptionId: string;
  status: string;
};

/** Extrae la suscripción de Stripe de un evento que la menciona. */
export function readStripeSubscription(event: Stripe.Event): StripeSubscriptionUpdate | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  if (!object || typeof object !== "object") return null;
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const id = object.id;
    const status = object.status;
    if (typeof id !== "string" || typeof status !== "string") return null;
    return { gatewaySubscriptionId: id, status };
  }
  if (event.type === "invoice.payment_failed") {
    const subscription = object.subscription;
    if (typeof subscription !== "string" || !subscription) return null;
    return { gatewaySubscriptionId: subscription, status: "past_due" };
  }
  return null;
}

/**
 * Cierra el cobro a la vuelta de Checkout: relee la sesión en Stripe y
 * registra el cobro solo si está pagada y apunta a esta factura.
 * La referencia guardada es el payment_intent: es lo que luego permite
 * reembolsar desde el panel.
 */
export async function finishStripeCheckout(input: {
  sessionId: string;
  invoiceId: string;
  userId: string;
}) {
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  if (!/^cs_(test|live)_[A-Za-z0-9]{8,80}$/.test(input.sessionId)) {
    throw new StripeError("mismatch");
  }
  const invoice = await db.customerInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { payment: true },
  });
  if (!invoice || invoice.userId !== input.userId) {
    throw new CommerceError("Factura no encontrada.", 404);
  }
  if (invoice.payment?.status === "confirmed") {
    // El cobro ya estaba registrado (p. ej. lo registró el webhook antes
    // que la vuelta del cliente): la conexión con Stripe Billing se
    // reintenta aquí, sin tocar el cobro.
    await ensureStripeBillingSubscription({
      invoiceId: invoice.id,
      userId: input.userId,
    });
    return { paid: true, paymentId: invoice.payment.id, invoiceId: invoice.id };
  }
  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.retrieve(input.sessionId);
  } catch {
    throw new StripeError("upstream");
  }
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const intent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
  if (
    session.payment_status !== "paid" ||
    metadata.invoice_id !== invoice.id ||
    !intent ||
    typeof session.amount_total !== "number" ||
    session.amount_total !== invoice.totalCents
  ) {
    throw new StripeError("mismatch");
  }
  const payment = await recordGatewayPayment({
    invoiceId: invoice.id,
    provider: "stripe",
    providerRef: intent,
    amountCents: session.amount_total,
    currency: (session.currency ?? invoice.currency).toUpperCase(),
    source: "capture",
  });
  // Conecta la suscripción local con Stripe Billing para que el cron pueda
  // cobrar las renovaciones con el método guardado. Si falla, el cobro
  // confirmado no se toca: ensure... nunca lanza.
  await ensureStripeBillingSubscription({
    invoiceId: invoice.id,
    userId: input.userId,
  });
  return { paid: true, paymentId: payment.id, invoiceId: invoice.id };
}

/**
 * Intervalo de Stripe Billing para un ciclo propio. Stripe sí puede
 * representar los cuatro ciclos: quarterly y semiannual son meses con
 * interval_count 3 y 6; annual es un año. "yearly" se acepta como alias
 * histórico de "annual". Un ciclo desconocido es un error, nunca se
 * adivina un intervalo.
 */
export function stripeRecurringForCycle(cycle: string): {
  interval: "month" | "year";
  interval_count: number;
} {
  switch (cycle) {
    case "monthly":
      return { interval: "month", interval_count: 1 };
    case "quarterly":
      return { interval: "month", interval_count: 3 };
    case "semiannual":
      return { interval: "month", interval_count: 6 };
    case "annual":
    case "yearly":
      return { interval: "year", interval_count: 1 };
    default:
      throw new StripeError("mismatch");
  }
}

export type BillingCycleInput =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "yearly";

/**
 * Crea la suscripción en Stripe Billing para un cobro recurrente futuro.
 * Usa `price_data` en línea: no exige un Price creado antes en el panel
 * de Stripe. El cliente se crea si no viene ya con `stripeCustomerId` y
 * el producto también se crea si no viene `stripeProductId` (esta versión
 * del SDK exige un producto existente para el `price_data`).
 *
 * Limitación conocida: el id del cliente de Stripe no se guarda en
 * ninguna tabla (no hay campo para ello), así que cada suscripción crea
 * su propio cliente en Stripe. El cobro de renovaciones usa el id de la
 * suscripción, que sí se guarda en `Subscription.gatewaySubscriptionId`.
 */
export async function createBillingSubscription(input: {
  customer: { email: string; name?: string; stripeCustomerId?: string; userId?: string };
  priceCents: number;
  currency: string;
  cycle: BillingCycleInput;
  stripeProductId?: string;
}) {
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    throw new StripeError("mismatch");
  }
  const email = input.customer.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StripeError("mismatch");
  let customerId = (input.customer.stripeCustomerId || "").trim();
  try {
    if (!customerId) {
      const created = await client.customers.create({
        email,
        name: input.customer.name?.trim() || undefined,
        metadata: input.customer.userId ? { user_id: input.customer.userId } : undefined,
      });
      customerId = created.id;
    }
    let productId = (input.stripeProductId || "").trim();
    if (!productId) {
      const product = await client.products.create({ name: "CaluServers" });
      productId = product.id;
    }
    const subscription = await client.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.priceCents,
            recurring: stripeRecurringForCycle(input.cycle),
            product: productId,
          },
        },
      ],
      metadata: input.customer.userId ? { user_id: input.customer.userId } : undefined,
    });
    return { subscriptionId: subscription.id, customerId };
  } catch (error) {
    if (error instanceof StripeError) throw error;
    throw new StripeError("upstream");
  }
}

export type EnsureStripeSubscriptionResult = {
  created: boolean;
  /** created | already-linked | not-stripe-payment | not-stripe-gateway | no-service | no-subscription | unsupported-cycle | not-found | stripe-error */
  reason: string;
  gatewaySubscriptionId?: string;
};

/**
 * Conecta la suscripción local con Stripe Billing tras el primer pago con
 * Stripe. Es el eslabón que faltaba: `createBillingSubscription` existía
 * pero ningún flujo la llamaba, así que `Subscription.gatewaySubscriptionId`
 * quedaba siempre vacío y el cron no podía cobrar renovaciones con el
 * método guardado.
 *
 * - Solo actúa si la factura está pagada con Stripe y su suscripción local
 *   tiene gatewayKey "stripe" y aún no tiene id de Stripe: idempotente,
 *   si ya hay id no llama a Stripe.
 * - Nunca lanza: un fallo de Stripe queda registrado como
 *   `billing.stripe_subscription_failed` y el pago confirmado no se toca;
 *   la renovación queda pendiente de cobro manual o del próximo pago con
 *   Stripe, que reintentará la conexión. La renovación sin id de Stripe
 *   sigue el camino de siempre (factura impaga + dunning).
 * - `userId` es opcional: si se da y no coincide con el dueño de la
 *   factura, no hace nada (el webhook no trae userId y llama sin él).
 */
export async function ensureStripeBillingSubscription(input: {
  invoiceId: string;
  userId?: string;
}): Promise<EnsureStripeSubscriptionResult> {
  const fail = async (reason: string): Promise<EnsureStripeSubscriptionResult> => {
    await db.commerceEvent
      .create({
        data: {
          actor: "stripe",
          action: "billing.stripe_subscription_failed",
          entityId: input.invoiceId,
          details: `reason=${reason}`,
        },
      })
      .catch(() => {});
    return { created: false, reason };
  };
  try {
    const invoice = await db.customerInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { payment: true, order: true },
    });
    if (!invoice) return { created: false, reason: "not-found" };
    if (input.userId && invoice.userId !== input.userId) {
      return { created: false, reason: "not-found" };
    }
    if (invoice.payment?.status !== "confirmed" || invoice.payment.provider !== "stripe") {
      return { created: false, reason: "not-stripe-payment" };
    }
    const service = await db.customerService.findFirst({
      where: { orderId: invoice.orderId },
    });
    if (!service) return { created: false, reason: "no-service" };
    const subscription = await db.subscription.findUnique({
      where: { serviceId: service.id },
    });
    if (!subscription) return { created: false, reason: "no-subscription" };
    if (subscription.gatewayKey !== "stripe") {
      return { created: false, reason: "not-stripe-gateway" };
    }
    if (subscription.gatewaySubscriptionId) {
      return {
        created: false,
        reason: "already-linked",
        gatewaySubscriptionId: subscription.gatewaySubscriptionId,
      };
    }
    try {
      // Valida el ciclo antes de llamar a Stripe; createBillingSubscription
      // vuelve a mapearlo al crear la suscripción.
      stripeRecurringForCycle(subscription.billingCycle);
    } catch {
      return fail("unsupported-cycle");
    }
    const user = await db.user.findUnique({ where: { id: invoice.userId } });
    const email = (user?.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("stripe-error");
    }
    let created: { subscriptionId: string; customerId: string };
    try {
      created = await createBillingSubscription({
        customer: {
          email,
          name: user?.name?.trim() || undefined,
          userId: invoice.userId,
        },
        priceCents: subscription.priceCents,
        currency: subscription.currency,
        cycle: subscription.billingCycle as BillingCycleInput,
      });
    } catch {
      return fail("stripe-error");
    }
    // La condición gatewaySubscriptionId null hace la conexión atómica:
    // si dos vías llegan a la vez, solo una guarda el id.
    const updated = await db.subscription.updateMany({
      where: { id: subscription.id, gatewaySubscriptionId: null },
      data: { gatewaySubscriptionId: created.subscriptionId },
    });
    if (updated.count === 0) {
      return { created: false, reason: "already-linked" };
    }
    await db.commerceEvent
      .create({
        data: {
          actor: "stripe",
          action: "billing.stripe_subscription_created",
          entityId: subscription.id,
          details: `gatewaySubscriptionId=${created.subscriptionId};cycle=${subscription.billingCycle}`,
        },
      })
      .catch(() => {});
    return {
      created: true,
      reason: "created",
      gatewaySubscriptionId: created.subscriptionId,
    };
  } catch {
    return fail("stripe-error");
  }
}

/**
 * Cobra una factura de renovación con el método guardado de una suscripción
 * de Stripe Billing (`charge_automatically`): crea el concepto, la factura
 * de Stripe con la referencia de la factura propia en los metadatos, la
 * cierra y la cobra. Sin método guardado, o con la tarjeta rechazada, no
 * hay cobro: lanza StripeError("charge_failed") y quien llama deja la
 * factura impaga para el dunning. No crea una suscripción nueva: cobra
 * sobre la que ya existe (`gatewaySubscriptionId`).
 */
export async function chargeStripeSubscriptionInvoice(input: {
  gatewaySubscriptionId: string;
  amountCents: number;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  description: string;
}) {
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new StripeError("mismatch");
  }
  try {
    const subscription = await client.subscriptions.retrieve(
      input.gatewaySubscriptionId,
    );
    if (
      subscription.status === "canceled" ||
      subscription.status === "incomplete_expired"
    ) {
      throw new StripeError("charge_failed");
    }
    const customer = subscription.customer;
    const customerId = typeof customer === "string" ? customer : customer.id;
    await client.invoiceItems.create({
      customer: customerId,
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      description: input.description,
    });
    const created = await client.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      metadata: {
        invoice_id: input.invoiceId,
        invoice_number: input.invoiceNumber,
      },
    });
    const finalized = await client.invoices.finalizeInvoice(created.id);
    if (finalized.amount_due !== input.amountCents) {
      throw new StripeError("mismatch");
    }
    let paid: Stripe.Invoice;
    try {
      paid = await client.invoices.pay(finalized.id);
    } catch {
      throw new StripeError("charge_failed");
    }
    if (paid.status !== "paid" || paid.amount_paid !== input.amountCents) {
      throw new StripeError("charge_failed");
    }
    return {
      providerRef: paid.id,
      amountCents: paid.amount_paid,
      currency: (paid.currency ?? input.currency).toUpperCase(),
    };
  } catch (error) {
    if (error instanceof StripeError) throw error;
    throw new StripeError("upstream");
  }
}

/**
 * Verifica la firma del webhook con el secreto de Stripe. Sin secreto no
 * se acepta ningún evento: un webhook sin verificar no registra cobros.
 * `rawBody` es el cuerpo tal cual llegó, sin parsear.
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event> {
  const secret = await stripeWebhookSecret();
  if (!secret) throw new StripeError("unconfigured");
  if (!signature) throw new StripeError("signature");
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  try {
    return client.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new StripeError("signature");
  }
}

/**
 * Reembolsa un cobro de Stripe y lo marca como reembolsado en BD.
 * Nunca automático: lo llama solo la acción de admin con nota.
 * La llamada a Stripe lleva clave de idempotencia por cobro: un reintento
 * tras un fallo de red no reembolsa dos veces. `providerRef` es el
 * payment_intent guardado al cobrar (o el charge del webhook de reembolso).
 */
export async function refundPayment(
  payment: { id: string; providerRef: string | null; amountCents: number; currency: string },
  amountCents?: number,
  opts?: { actor?: string; note?: string },
) {
  if (!payment.providerRef) throw new StripeError("mismatch");
  const amount = amountCents ?? payment.amountCents;
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > payment.amountCents
  ) {
    throw new StripeError("mismatch");
  }
  const client = await getStripeClient();
  if (!client) throw new StripeError("unconfigured");
  const ref = payment.providerRef;
  let params: Stripe.RefundCreateParams;
  if (ref.startsWith("pi_")) {
    params = { payment_intent: ref };
  } else if (ref.startsWith("ch_")) {
    params = { charge: ref };
  } else if (ref.startsWith("cs_")) {
    let intent: string | null = null;
    try {
      const session = await client.checkout.sessions.retrieve(ref);
      intent =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
    } catch {
      throw new StripeError("upstream");
    }
    if (!intent) throw new StripeError("mismatch");
    params = { payment_intent: intent };
  } else {
    throw new StripeError("mismatch");
  }
  if (amount < payment.amountCents) params.amount = amount;
  let refund: Stripe.Refund;
  try {
    refund = await client.refunds.create(params, {
      idempotencyKey: `refund-${payment.id}`,
    });
  } catch {
    throw new StripeError("upstream");
  }
  const updated = await markPaymentRefunded({
    actor: opts?.actor ?? "stripe",
    paymentId: payment.id,
    note: opts?.note ?? `Reembolso en Stripe (${refund.id}).`,
  });
  return { refundId: refund.id, status: refund.status ?? "succeeded", payment: updated };
}
