/**
 * Contratos de plugin (Fase 2, frente A).
 *
 * Solo interfaces: ningún adaptador se implementa aquí. Cada plugin
 * conocido se registra en `lib/plugins.ts` (manifiesto) y su adaptador
 * vive en su propio módulo (p. ej. el panel WHM ya existe en
 * `lib/whm-transport.ts` + `lib/whm-provision.ts`; no se reescribe).
 *
 * Regla común: un plugin sin credenciales guardadas NO es usable. El
 * adaptador debe fallar con un error claro ("sin credenciales") en lugar
 * de simular un cobro, un registro o un alta.
 */

/** Resultado mínimo de un intento de cobro. */
export type PaymentResult =
  | { status: "redirect"; redirectUrl: string }
  | { status: "client-secret"; clientSecret: string }
  | { status: "pending-manual"; reference: string };

/** Evento normalizado que sale de un webhook de pasarela. */
export type PaymentEvent = {
  /** `payment.succeeded` | `payment.failed` | `payment.refunded` | `subscription.*` */
  type: string;
  /** Id del pago en la pasarela (para idempotencia). */
  gatewayPaymentId: string;
  /** Id de la factura local, cuando el webhook lo permite identificar. */
  invoiceId?: string;
  amountCents?: number;
  currency?: string;
};

/** Pasarela de pago (Stripe, PayPal, transferencia manual). */
export interface PaymentGateway {
  /** Clave del plugin (`stripe`, `paypal`, `bank_transfer`). */
  readonly key: string;
  /** true solo si la pasarela puede cobrar suscripciones sola. */
  readonly supportsRecurring: boolean;

  /**
   * Crea el intento de cobro de una factura y devuelve a dónde llevar al
   * cliente (URL de la pasarela) o el secreto para confirmar en el
   * navegador. Sin credenciales guardadas, lanza en lugar de simular.
   */
  createCheckout(invoice: {
    id: string;
    number: string;
    amountCents: number;
    currency: string;
    customerEmail: string;
  }): Promise<PaymentResult>;

  /**
   * Valida la firma y normaliza el cuerpo crudo del webhook a eventos.
   * Firma inválida: devuelve `[]` y deja constancia; nunca lanza con el
   * cuerpo dentro del mensaje.
   */
  handleWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent[]>;

  /**
   * Devuelve el importe de un pago. `amountCents` ausente = reembolso total.
   * La transferencia manual no lo soporta: lanza `not-supported`.
   */
  refund(
    payment: { gatewayPaymentId: string; amountCents: number; currency: string },
    amountCents?: number,
  ): Promise<{ refundedCents: number }>;
}

/** Disponibilidad y datos mínimos de un dominio. */
export type DomainAvailability = {
  domain: string;
  available: boolean;
  /** Precio del primer año en céntimos, cuando el registrador lo da. */
  priceCents?: number;
  currency?: string;
};

/** Registrador de dominios (Fase 3: Porkbun y siguientes). */
export interface DomainRegistrar {
  readonly key: string;

  checkAvailability(domain: string): Promise<DomainAvailability>;
  register(input: {
    domain: string;
    years: number;
    registrant: {
      name: string;
      email: string;
      organization?: string;
      country?: string;
    };
    nameservers?: string[];
  }): Promise<{ domain: string; expiresAt: Date }>;
  transfer(input: {
    domain: string;
    authCode: string;
    years?: number;
  }): Promise<{ domain: string; status: string }>;
  renew(domain: string, years: number): Promise<{ domain: string; expiresAt: Date }>;
  getDomain(domain: string): Promise<{
    domain: string;
    status: string;
    expiresAt: Date | null;
    autoRenew: boolean;
    nameservers: string[];
  }>;
  setAutoRenew(domain: string, enabled: boolean): Promise<void>;
  setNameservers(domain: string, nameservers: string[]): Promise<void>;
  /** Código EPP para trasladar el dominio fuera. Solo bajo demanda del dueño. */
  getAuthCode(domain: string): Promise<string>;
}

/** Panel de hosting (WHM/cPanel ahora; Plesk y DirectAdmin en Fase 4). */
export interface ControlPanel {
  readonly key: string;

  createAccount(input: {
    domain: string;
    username: string;
    password: string;
    plan: string;
    email: string;
  }): Promise<{ username: string; domain: string }>;
  suspendAccount(input: { username: string; reason?: string }): Promise<void>;
  unsuspendAccount(input: { username: string }): Promise<void>;
  terminateAccount(input: { username: string }): Promise<void>;
  changePackage(input: { username: string; plan: string }): Promise<void>;
  listAccounts(): Promise<{ username: string; domain: string; suspended: boolean }[]>;
  listPackages(): Promise<{ name: string }[]>;
}
