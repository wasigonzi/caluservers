import "server-only";
import { billingPolicy } from "@/lib/commerce";
import { noticeRecipient } from "@/lib/contact-intake";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import { mailerConfigured } from "@/lib/mailer";
import { monthLabel, monthStart } from "@/lib/admin-format";
import { paypalEnv, paypalReady, paypalWebhookReady } from "@/lib/paypal";
import { whmConfiguration } from "@/lib/whm";
import { provisionConfiguration } from "@/lib/whm-provision";

export const PAGE_SIZE = 25;

export type LoadFailure = "migration" | "connection" | "unknown";

function safeName(value: unknown): string | null {
  return typeof value === "string" && /^[\w."]{1,80}$/.test(value) ? value : null;
}

/**
 * Registra por qué falló una lectura del panel y devuelve la causa para mostrarla.
 * Al registro solo van códigos y nombres de tabla o columna: nunca el mensaje del
 * error ni datos de conexión.
 */
export function loadFailure(error: unknown, section: string): LoadFailure {
  const summary = reportDbError(error, process.env.DATABASE_URL);
  const meta =
    typeof error === "object" && error !== null
      ? (Object.getOwnPropertyDescriptor(error, "meta")?.value as Record<string, unknown> | undefined)
      : undefined;
  console.error("admin_load_failure", {
    section,
    category: summary.category,
    codes: summary.codes,
    model: safeName(meta?.modelName),
    table: safeName(meta?.table),
    column: safeName(meta?.column),
  });
  if (summary.category === "missing_table" || summary.category === "missing_column") return "migration";
  if (summary.category === "unknown" || summary.category === "query" || summary.category === "constraint") {
    return "unknown";
  }
  return "connection";
}

export type NavCounts = {
  facturas: number;
  servicios: number;
  tickets: number;
  mensajes: number;
};

/**
 * Pendientes que se muestran como contador en el menú. Cada contador se lee por
 * separado: si falta una tabla, los demás siguen saliendo.
 */
export async function navCounts(): Promise<Partial<NavCounts>> {
  const read = async (key: keyof NavCounts, query: () => Promise<number>) => {
    try {
      return [key, await query()] as const;
    } catch (error) {
      loadFailure(error, `menu.${key}`);
      return null;
    }
  };
  const results = await Promise.all([
    read("facturas", () => db.customerInvoice.count({ where: { status: "issued" } })),
    read("servicios", () => db.customerService.count({ where: { status: "pending_provision" } })),
    read("tickets", () => db.supportTicket.count({ where: { status: "open" } })),
    read("mensajes", () => db.contactMessage.count({ where: { status: "new" } })),
  ]);
  return Object.fromEntries(results.filter((r) => r !== null));
}

/**
 * Comprueba que el esquema tiene lo que añadió la última migración.
 * Devuelve lo que falta, con nombres de tabla o columna y nada más.
 */
export async function schemaGaps(): Promise<string[]> {
  const probes: [string, () => Promise<unknown>][] = [
    ["la tabla ContactMessage", () => db.contactMessage.findFirst({ select: { id: true } })],
    ["la tabla RequestThrottle", () => db.requestThrottle.findFirst({ select: { id: true } })],
    ["la tabla ProvisionSetting", () => db.provisionSetting.findFirst({ select: { id: true } })],
    [
      "columnas de alta en CustomerService",
      () => db.customerService.findFirst({ select: { cpanelUser: true, provisionError: true } }),
    ],
    ["columnas de pasarela en los pagos", () => db.payment.findFirst({ select: { provider: true } })],
    ["el dominio en CustomerOrder", () => db.customerOrder.findFirst({ select: { domain: true } })],
  ];
  const gaps: string[] = [];
  for (const [name, probe] of probes) {
    try {
      await probe();
    } catch (error) {
      if (loadFailure(error, "schema") === "migration") gaps.push(name);
    }
  }
  return gaps;
}

export type ActivityEntry = {
  id: string;
  source: "comercio" | "panel";
  actor: string;
  action: string;
  entityId: string | null;
  details: string;
  createdAt: Date;
};

/** Diario unificado: eventos de comercio y auditoría del panel, del más nuevo al más viejo. */
export async function activityLog(take: number, skip = 0): Promise<ActivityEntry[]> {
  const window = take + skip;
  const [events, audits] = await Promise.all([
    db.commerceEvent.findMany({ orderBy: { createdAt: "desc" }, take: window }),
    db.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: window }),
  ]);
  const merged: ActivityEntry[] = [
    ...events.map((e) => ({
      id: e.id,
      source: "comercio" as const,
      actor: e.actor,
      action: e.action,
      entityId: e.entityId,
      details: e.details,
      createdAt: e.createdAt,
    })),
    ...audits.map((a) => ({
      id: a.id,
      source: "panel" as const,
      actor: "admin",
      action: a.action,
      entityId: a.entityId,
      details: a.details ?? "",
      createdAt: a.createdAt,
    })),
  ];
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(skip, skip + take);
}

export async function activityTotal(): Promise<number> {
  const [a, b] = await Promise.all([db.commerceEvent.count(), db.adminAudit.count()]);
  return a + b;
}

/** Los actores de comercio son ids de cliente, "paypal" o el correo del admin. */
export async function actorNames(entries: ActivityEntry[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      entries
        .filter((e) => e.source === "comercio" && !e.actor.includes("@") && e.actor !== "paypal")
        .map((e) => e.actor),
    ),
  ];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}

export type SystemCheck = {
  label: string;
  state: "ok" | "warn" | "off";
  detail: string;
  href?: string;
};

/** Lo que falta por configurar para que la tienda cobre y entregue sola. */
export async function systemChecks(): Promise<SystemCheck[]> {
  const policy = billingPolicy();
  const [whm, provision, inbox] = await Promise.all([
    whmConfiguration().catch(() => null),
    provisionConfiguration().catch(() => null),
    noticeRecipient().catch(() => ""),
  ]);
  const customerAuth = (process.env.BETTER_AUTH_SECRET || "").length >= 32;
  return [
    {
      label: "Moneda e impuestos",
      state: policy.ok ? "ok" : "warn",
      detail: policy.ok
        ? `${policy.currency}, sin impuesto`
        : "Sin BILLING_CURRENCY y TAX_MODE los pedidos quedan como proforma no cobrable.",
    },
    {
      label: "Registro de clientes",
      state: customerAuth ? "ok" : "warn",
      detail: customerAuth ? "Activo" : "Falta BETTER_AUTH_SECRET: el registro responde 503.",
    },
    {
      label: "Correo saliente",
      state: mailerConfigured() ? "ok" : "warn",
      detail: mailerConfigured()
        ? inbox
          ? `Avisos internos hacia ${inbox}`
          : "Activo, pero sin dirección para avisos internos."
        : "Sin SMTP_URL no salen verificaciones, avisos ni credenciales.",
      href: "/admin/configuracion",
    },
    {
      label: "Cobro con PayPal",
      state: paypalReady() ? (paypalWebhookReady() ? "ok" : "warn") : "off",
      detail: paypalReady()
        ? paypalWebhookReady()
          ? `Activo (${paypalEnv()}) con webhook verificado`
          : `Activo (${paypalEnv()}) sin PAYPAL_WEBHOOK_ID: los avisos de PayPal se rechazan.`
        : "No configurado. El cobro se confirma a mano desde Facturas.",
    },
    {
      label: "Conexión WHM (lectura)",
      state: whm ? (whm.configured ? "ok" : "off") : "warn",
      detail: whm
        ? whm.configured
          ? "Configurada"
          : "Pendiente de configuración."
        : "No se pudo leer la configuración.",
      href: "/admin/settings",
    },
    {
      label: "Alta automática en WHM",
      state: provision ? (provision.ready ? "ok" : provision.enabled ? "warn" : "off") : "warn",
      detail: provision
        ? provision.ready
          ? "Lista: crea la cuenta cPanel al confirmar el pago."
          : provision.enabled
            ? "Activada pero incompleta."
            : "Desactivada. Las altas se marcan a mano desde Servicios."
        : "No se pudo leer la configuración.",
      href: "/admin/provision",
    },
  ];
}

export type DashboardData = {
  currency: string;
  revenueMonthCents: number;
  revenuePrevCents: number;
  outstandingCents: number;
  outstandingCount: number;
  activeServices: number;
  customers: number;
  customersMonth: number;
  months: { label: string; cents: number }[];
};

export async function dashboardData(now = new Date()): Promise<DashboardData> {
  const policy = billingPolicy();
  const since = monthStart(now, 5);
  const thisMonth = monthStart(now, 0);
  const [payments, outstanding, activeServices, customers, customersMonth] = await Promise.all([
    db.payment.findMany({
      where: { status: "confirmed", createdAt: { gte: since } },
      select: { amountCents: true, currency: true, createdAt: true },
    }),
    db.customerInvoice.aggregate({
      where: { status: "issued" },
      _sum: { totalCents: true },
      _count: true,
    }),
    db.customerService.count({ where: { status: "active" } }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: thisMonth } } }),
  ]);
  const currency = policy.currency || payments[0]?.currency || "USD";
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = monthStart(now, 5 - i);
    const end = monthStart(now, 4 - i);
    const cents = payments
      .filter((p) => p.currency === currency && p.createdAt >= start && p.createdAt < end)
      .reduce((sum, p) => sum + p.amountCents, 0);
    return { label: monthLabel(start), cents };
  });
  return {
    currency,
    revenueMonthCents: months[5].cents,
    revenuePrevCents: months[4].cents,
    outstandingCents: outstanding._sum.totalCents ?? 0,
    outstandingCount: outstanding._count,
    activeServices,
    customers,
    customersMonth,
    months,
  };
}
