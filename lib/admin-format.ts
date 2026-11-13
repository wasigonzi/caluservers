/** Formato y etiquetas del panel. Sin dependencias de servidor: se puede probar suelto. */

export const ADMIN_TIME_ZONE = "America/Puerto_Rico";

export function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function dateTime(date: Date): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ADMIN_TIME_ZONE,
  }).format(date);
}

export function dateOnly(date: Date): string {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: ADMIN_TIME_ZONE }).format(date);
}

export type Tone = "ok" | "warn" | "danger" | "info" | "muted";
export type StatusInfo = { label: string; tone: Tone };

const INVOICE: Record<string, StatusInfo> = {
  issued: { label: "Por cobrar", tone: "warn" },
  paid: { label: "Pagada", tone: "ok" },
  proforma: { label: "Proforma", tone: "muted" },
  void: { label: "Anulada", tone: "danger" },
};
const SERVICE: Record<string, StatusInfo> = {
  pending_provision: { label: "Pendiente de alta", tone: "warn" },
  provisioning: { label: "Alta en curso", tone: "info" },
  active: { label: "Activo", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "danger" },
};
const TICKET: Record<string, StatusInfo> = {
  open: { label: "Abierto", tone: "warn" },
  answered: { label: "Respondido", tone: "ok" },
  closed: { label: "Cerrado", tone: "muted" },
};
const ORDER: Record<string, StatusInfo> = {
  submitted: { label: "Recibido", tone: "info" },
  paid: { label: "Pagado", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "danger" },
};
const MESSAGE: Record<string, StatusInfo> = {
  new: { label: "Nuevo", tone: "warn" },
  read: { label: "Leído", tone: "info" },
  archived: { label: "Archivado", tone: "muted" },
};

function lookup(map: Record<string, StatusInfo>, status: string): StatusInfo {
  return map[status] ?? { label: status, tone: "muted" };
}
export const invoiceStatus = (s: string) => lookup(INVOICE, s);
export const serviceStatus = (s: string) => lookup(SERVICE, s);
export const ticketStatus = (s: string) => lookup(TICKET, s);
export const orderStatus = (s: string) => lookup(ORDER, s);
export const messageStatus = (s: string) => lookup(MESSAGE, s);

const ACTIONS: Record<string, string> = {
  "order.created": "Pedido creado",
  "payment.confirmed": "Pago confirmado",
  "invoice.voided": "Factura anulada",
  "service.status": "Estado de servicio cambiado",
  "service.provisioned": "Cuenta creada en WHM",
  "service.provision_failed": "Alta en WHM fallida",
  "payment.started": "Cobro iniciado en PayPal",
  "whm.settings.updated": "Conexión WHM guardada",
  "whm.provision.updated": "Alta automática configurada",
  "ticket.closed": "Ticket cerrado",
  "ticket.reopened": "Ticket reabierto",
  "site.settings.updated": "Ajustes del sitio guardados",
  "page.content.updated": "Contenido de página guardado",
  "catalog.updated": "Catálogo actualizado",
  "catalog.restored": "Catálogo restaurado",
};
export function actionLabel(action: string): string {
  return ACTIONS[action] ?? action;
}

/** Página pedida en `?p=`, siempre entera y entre 1 y `pages`. */
export function pageNumber(raw: string | undefined, pages: number): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, pages));
}

/** Texto de búsqueda saneado: sin espacios sobrantes y acotado. */
export function searchTerm(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 80);
}

/** Inicio del mes (hora de Puerto Rico, UTC-4 sin horario de verano) `back` meses atrás. */
export function monthStart(now: Date, back = 0): Date {
  const local = new Date(now.getTime() - 4 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - back, 1, 4));
}

export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("es", { month: "short", timeZone: ADMIN_TIME_ZONE }).format(date);
}
