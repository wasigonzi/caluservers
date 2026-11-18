import "server-only";
import { CommerceError } from "./commerce";
import { paymentInstructions } from "./billing-settings";
import { paypalReady } from "./paypal";
import { payableInvoice, startPaypalCheckout } from "./paypal-checkout";
import {
  readStripePayment,
  readStripeSubscription,
  startStripeCheckout,
  stripeReady,
  verifyWebhook,
} from "./stripe";

/**
 * Pasarelas de cobro. El adaptador es solo una fachada: cada pasarela
 * sigue viviendo en su propio módulo (PayPal en lib/paypal*, Stripe en
 * lib/stripe.ts) y la transferencia no tiene API.
 *
 * Reglas que valen para todas:
 * - El importe, la moneda y el dueño salen siempre de la factura en BD.
 * - La firma del webhook se verifica ANTES de registrar nada.
 * - Una pasarela desactivada o sin credenciales no se ofrece: el checkout
 *   responde 503 honesto, sin simular el cobro.
 */

export type GatewayKey = "paypal" | "stripe" | "bank_transfer";

export type CheckoutStarted =
  | {
      gatewayKey: "paypal";
      orderId: string;
      approveUrl: string;
      invoiceId: string;
    }
  | { gatewayKey: "stripe"; sessionId: string; url: string; invoiceId: string }
  | {
      gatewayKey: "bank_transfer";
      pending: true;
      instructions: string;
      invoiceNumber: string;
      invoiceId: string;
    };

export type GatewayAdapter = {
  key: GatewayKey;
  label: string;
  /** true si el cobro sale por API; false si es manual (transferencia). */
  online: boolean;
  ready: () => Promise<boolean>;
  startCheckout: (input: { invoiceId: string; userId: string }) => Promise<CheckoutStarted>;
};

/**
 * Transferencia bancaria: no hay orden de pasarela. La factura queda
 * pendiente y el cliente ve las instrucciones; el admin la cobra a mano
 * con `confirmManualPayment` y provider `bank_transfer`. La referencia
 * obligatoria es el número de factura.
 */
async function startBankTransferCheckout(input: {
  invoiceId: string;
  userId: string;
}): Promise<CheckoutStarted> {
  const invoice = await payableInvoice(input.invoiceId, input.userId);
  const instructions = await paymentInstructions();
  return {
    gatewayKey: "bank_transfer",
    pending: true,
    instructions,
    invoiceNumber: invoice.number,
    invoiceId: invoice.id,
  };
}

export function getGateway(key: string): GatewayAdapter | null {
  if (key === "paypal") {
    return {
      key: "paypal",
      label: "PayPal",
      online: true,
      ready: async () => paypalReady(),
      startCheckout: async (input) => ({
        gatewayKey: "paypal" as const,
        ...(await startPaypalCheckout(input)),
      }),
    };
  }
  if (key === "stripe") {
    return {
      key: "stripe",
      label: "Stripe",
      online: true,
      ready: stripeReady,
      startCheckout: async (input) => ({
        gatewayKey: "stripe" as const,
        ...(await startStripeCheckout(input)),
      }),
    };
  }
  if (key === "bank_transfer") {
    return {
      key: "bank_transfer",
      label: "Transferencia bancaria",
      online: false,
      ready: async () => true,
      startCheckout: startBankTransferCheckout,
    };
  }
  return null;
}

export type GatewayInfo = {
  key: GatewayKey;
  label: string;
  online: boolean;
  ready: boolean;
};

/** Pasarelas que el checkout puede ofrecer, con su estado real. */
export async function availableGateways(): Promise<GatewayInfo[]> {
  const keys: GatewayKey[] = ["paypal", "stripe", "bank_transfer"];
  const infos: GatewayInfo[] = [];
  for (const key of keys) {
    const adapter = getGateway(key);
    if (!adapter) continue;
    infos.push({
      key: adapter.key,
      label: adapter.label,
      online: adapter.online,
      ready: await adapter.ready(),
    });
  }
  return infos;
}

/** Abre el cobro por la pasarela elegida. La factura la valida cada pasarela. */
export async function startCheckout(input: {
  gatewayKey: string;
  invoiceId: string;
  userId: string;
}): Promise<CheckoutStarted> {
  const adapter = getGateway(input.gatewayKey);
  if (!adapter) throw new CommerceError("Pasarela no reconocida.", 400);
  if (!(await adapter.ready())) {
    throw new CommerceError(`El cobro con ${adapter.label} no está configurado todavía.`, 503);
  }
  return adapter.startCheckout({ invoiceId: input.invoiceId, userId: input.userId });
}

export type NormalizedGatewayEvent =
  | {
      type: "payment";
      providerRef: string;
      amountCents: number;
      currency: string;
      invoiceId: string;
    }
  | {
      type: "payment_failed";
      gatewaySubscriptionId: string | null;
      invoiceId: string | null;
    }
  | {
      type: "subscription_updated";
      gatewaySubscriptionId: string;
      status: string;
    }
  | { type: "subscription_deleted"; gatewaySubscriptionId: string }
  | {
      type: "refunded";
      providerRef: string;
      amountCents: number;
      currency: string;
    }
  | { type: "ignored"; gatewayType: string; reason?: string };

/**
 * Verifica la firma del webhook de la pasarela y devuelve el evento
 * normalizado. PayPal mantiene su propia ruta (`/api/paypal/webhook`)
 * porque su verificación es una llamada a su API; aquí solo vive Stripe.
 * Sin firma válida no se devuelve nada que la ruta pueda registrar.
 */
export async function handleGatewayWebhook(input: {
  gatewayKey: string;
  rawBody: string;
  headers: { get(name: string): string | null };
}): Promise<NormalizedGatewayEvent> {
  if (input.gatewayKey !== "stripe") {
    throw new CommerceError("Esa pasarela no tiene webhook genérico.", 400);
  }
  const signature = input.headers.get("stripe-signature");
  const event = await verifyWebhook(input.rawBody, signature);

  if (event.type === "checkout.session.completed" || event.type === "invoice.paid") {
    const payment = readStripePayment(event);
    if (!payment) {
      return { type: "ignored", gatewayType: event.type, reason: "sin-cobro" };
    }
    return { type: "payment", ...payment };
  }
  if (event.type === "invoice.payment_failed") {
    const subscription = readStripeSubscription(event);
    const payment = readStripePayment(event);
    return {
      type: "payment_failed",
      gatewaySubscriptionId: subscription?.gatewaySubscriptionId ?? null,
      invoiceId: payment?.invoiceId ?? null,
    };
  }
  if (event.type === "customer.subscription.updated") {
    const subscription = readStripeSubscription(event);
    if (!subscription) {
      return { type: "ignored", gatewayType: event.type, reason: "sin-suscripcion" };
    }
    return {
      type: "subscription_updated",
      gatewaySubscriptionId: subscription.gatewaySubscriptionId,
      status: subscription.status,
    };
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = readStripeSubscription(event);
    if (!subscription) {
      return { type: "ignored", gatewayType: event.type, reason: "sin-suscripcion" };
    }
    return {
      type: "subscription_deleted",
      gatewaySubscriptionId: subscription.gatewaySubscriptionId,
    };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as unknown as Record<string, unknown>;
    const id = charge.id;
    const amount = charge.amount_refunded;
    const currency = charge.currency;
    if (
      typeof id !== "string" ||
      !id ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      typeof currency !== "string"
    ) {
      return { type: "ignored", gatewayType: event.type, reason: "sin-reembolso" };
    }
    return {
      type: "refunded",
      providerRef: id,
      amountCents: amount,
      currency: currency.toUpperCase(),
    };
  }
  return { type: "ignored", gatewayType: event.type };
}
