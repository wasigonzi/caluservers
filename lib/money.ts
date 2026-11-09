/** Moneda comercial decidida por el propietario: dólar estadounidense. */
export const COMMERCIAL_CURRENCY = "USD" as const;

/** Jurisdicción del emisor declarada por el propietario. No incluye dirección ni registro. */
export const ISSUER_JURISDICTION = "Puerto Rico";

export const ISSUER_CONTEXT =
  `Emisor previsto: ${ISSUER_JURISDICTION}. Moneda comercial: dólar estadounidense (USD). No constan razón social, municipio, dirección, registro fiscal ni tipo de contribuyente.`;

export const MISSING_CURRENCY_ERROR =
  "La moneda no está aplicada en este entorno. El propietario decidió facturar en dólares estadounidenses: al desplegar hay que definir BILLING_CURRENCY=USD. No se muestra ni se cobra un importe inventado.";

export const UNSUPPORTED_CURRENCY_ERROR =
  "La moneda comercial de CaluServers es USD con dos decimales. No se convierten ni se reetiquetan los precios de lista.";

export const MISSING_TAX_POLICY_ERROR =
  `Falta una política fiscal explícita del emisor en ${ISSUER_JURISDICTION}. No se confirma el pago, no hay pasarela, no se aplica una tasa y no se declara una exención. El tratamiento del hosting, de los servicios y de cada cliente sigue pendiente de confirmación fiscal. La factura queda como proforma no cobrable.`;

export const EXPLICIT_TAX_ENVIRONMENT_NOTE =
  "Este entorno trae una declaración fiscal explícita en su configuración. Eso no documenta una tasa ni una exención de Puerto Rico. No hay pasarela: un pago solo puede anotarse a mano y el alta no llama a WHM.";

export const WHM_ACTIVATION_NOTE =
  "Registrar un estado aquí no crea una cuenta en WHM ni en cPanel.";

export function currencyMinorExponent(code: string): number | null {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized,
    }).resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" ? digits : null;
  } catch {
    return null;
  }
}

export function resolveBillingCurrency(raw: string | undefined):
  | { ok: true; currency: typeof COMMERCIAL_CURRENCY }
  | { ok: false; error: string } {
  const currency = (raw ?? "").trim().toUpperCase();
  if (!currency) return { ok: false, error: MISSING_CURRENCY_ERROR };
  if (currency !== COMMERCIAL_CURRENCY || currencyMinorExponent(COMMERCIAL_CURRENCY) !== 2) {
    return { ok: false, error: UNSUPPORTED_CURRENCY_ERROR };
  }
  return { ok: true, currency: COMMERCIAL_CURRENCY };
}

/**
 * Presenta unidades menores de USD como dólares con dos decimales.
 * 399 → "3,99 USD". No inventa USD si la moneda llega vacía.
 */
export function formatMinorAmount(minor: number, currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (!code) return "Importe sin moneda configurada";
  if (code !== COMMERCIAL_CURRENCY || currencyMinorExponent(COMMERCIAL_CURRENCY) !== 2) {
    return "Moneda no soportada";
  }
  if (!Number.isSafeInteger(minor)) return "Importe no válido";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped},${frac} ${COMMERCIAL_CURRENCY}`;
}

export function formatDateTime(value: Date): string {
  const formatted = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(value);
  return `${formatted} UTC`;
}

export function orderStatusLabel(status: string): string {
  if (status === "submitted") return "Recibido, sin cobro automático";
  return "Estado de pedido no reconocido";
}

export function invoiceStatusLabel(status: string, paid: boolean): string {
  if (status === "proforma") return "Proforma, no cobrable";
  if (status === "void") return "Anulada";
  if (status === "issued") return paid ? "Emitida, con pago manual" : "Emitida, pendiente de pago manual";
  return "Estado de factura no reconocido";
}

export function taxModeLabel(mode: string): string {
  if (mode === "none") return "Declaración fiscal explícita en el entorno";
  if (mode === "unconfigured" || mode === "") return "Impuesto sin decidir";
  return "Política fiscal no reconocida";
}

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sin pago";
  if (status === "confirmed") return "Pago manual confirmado";
  return "Estado de pago no reconocido";
}

export function serviceStatusLabel(status: string): string {
  if (status === "pending_provision") return "Pendiente de alta manual en este panel";
  if (status === "active") return "Marcado activo solo en este panel";
  if (status === "cancelled") return "Cancelado";
  return "Estado de servicio no reconocido";
}

export function ticketStatusLabel(status: string): string {
  if (status === "open") return "Abierto";
  if (status === "answered") return "Respondido";
  if (status === "closed") return "Cerrado";
  return "Estado de ticket no reconocido";
}

export function authorLabel(author: string): string {
  if (author === "customer") return "Cliente";
  if (author === "admin") return "Administrador";
  return "Autor";
}
