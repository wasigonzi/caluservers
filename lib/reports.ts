/**
 * Informes (Fase 6, frente A): antigüedad de facturas vencidas impagas,
 * ingresos por mes y por producto, suscripciones por estado y dominios por
 * expirar. Todo se calcula desde la BD real con Prisma; sin datos, los
 * informes devuelven ceros honestos, nunca cifras inventadas.
 *
 * Notas de criterio (documentadas para el dueño):
 * - Una factura vencida es una factura impaga (issued o proforma, nunca
 *   void ni paid) cuya fecha de vencimiento ya pasó. Sin dueDate, se toma
 *   la fecha de creación como vencimiento: una factura inicial nace
 *   exigible al emitirse.
 * - Los ingresos por mes usan la fecha del cobro confirmado cuando existe
 *   (Payment.createdAt); si no, la de la factura.
 * - Los ingresos por producto agrupan las líneas de las facturas pagadas
 *   por su descripción; las líneas de descuento (importe negativo) no
 *   cuentan como producto.
 */

export type AgingBucketKey = "0-30" | "31-60" | "61-90" | "90+";

export type AgingBucket = {
  bucket: AgingBucketKey;
  label: string;
  count: number;
  totalCents: number;
};

export type AgingInvoiceRow = {
  id: string;
  number: string;
  userId: string;
  totalCents: number;
  currency: string;
  dueDate: Date;
  daysOverdue: number;
  bucket: AgingBucketKey;
};

export type AgingReport = {
  buckets: AgingBucket[];
  totalCount: number;
  totalCents: number;
  invoices: AgingInvoiceRow[];
};

export type RevenueMonth = {
  month: string;
  label: string;
  totalCents: number;
  invoiceCount: number;
};

export type RevenueProduct = {
  product: string;
  totalCents: number;
  lineCount: number;
};

export type RevenueReport = {
  months: RevenueMonth[];
  products: RevenueProduct[];
  totalCents: number;
};

export type SubscriptionReport = {
  byStatus: { status: string; count: number }[];
  total: number;
};

export type ExpiringDomainRow = {
  id: string;
  domain: string;
  userId: string;
  expiresAt: Date;
  daysLeft: number;
};

export type ReportsOverview = {
  aging: AgingReport;
  revenue: RevenueReport;
  subscriptions: SubscriptionReport;
  expiringDomains: ExpiringDomainRow[];
};

/** Lo mínimo de la BD que usan los informes: así se prueban con una BD falsa. */
export type ReportsDb = {
  customerInvoice: {
    findMany: (args: any) => Promise<unknown[]>;
  };
  subscription: {
    groupBy: (args: any) => Promise<{ status: string; _count: number }[]>;
  };
  registeredDomain: {
    findMany: (args: any) => Promise<unknown[]>;
  };
};

const DAY_MS = 24 * 60 * 60_000;

export function agingBucket(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  "0-30": "0–30 días",
  "31-60": "31–60 días",
  "61-90": "61–90 días",
  "90+": "Más de 90 días",
};

const BUCKET_ORDER: AgingBucketKey[] = ["0-30", "31-60", "61-90", "90+"];

type InvoiceRow = {
  id: string;
  number: string;
  userId: string;
  totalCents: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
  payment?: { createdAt: Date } | null;
  lines?: { description: string; totalCents: number }[];
};

export async function getAgingReport(db: ReportsDb, now = new Date()): Promise<AgingReport> {
  const rows = (await db.customerInvoice.findMany({
    where: { status: { in: ["issued", "proforma"] } },
  })) as InvoiceRow[];
  const buckets = new Map<AgingBucketKey, AgingBucket>(
    BUCKET_ORDER.map((bucket) => [bucket, { bucket, label: BUCKET_LABELS[bucket], count: 0, totalCents: 0 }]),
  );
  const invoices: AgingInvoiceRow[] = [];
  for (const row of rows) {
    const due = row.dueDate ?? row.createdAt;
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / DAY_MS);
    if (daysOverdue < 0) continue;
    const bucket = agingBucket(daysOverdue);
    const entry = buckets.get(bucket)!;
    entry.count += 1;
    entry.totalCents += row.totalCents;
    invoices.push({
      id: row.id,
      number: row.number,
      userId: row.userId,
      totalCents: row.totalCents,
      currency: row.currency,
      dueDate: due,
      daysOverdue,
      bucket,
    });
  }
  invoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const totalCount = invoices.length;
  const totalCents = invoices.reduce((sum, row) => sum + row.totalCents, 0);
  return { buckets: BUCKET_ORDER.map((key) => buckets.get(key)!), totalCount, totalCents, invoices };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("es-PR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function getRevenueReport(db: ReportsDb, now = new Date()): Promise<RevenueReport> {
  const rows = (await db.customerInvoice.findMany({
    where: { status: "paid" },
    include: { payment: true, lines: true },
  })) as InvoiceRow[];
  const months: RevenueMonth[] = [];
  for (let back = 11; back >= 0; back--) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push({ month: monthKey(first), label: monthLabel(first), totalCents: 0, invoiceCount: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const byProduct = new Map<string, RevenueProduct>();
  let totalCents = 0;
  for (const row of rows) {
    const paidAt = row.payment?.createdAt ?? row.createdAt;
    const key = monthKey(paidAt);
    const month = byMonth.get(key);
    // Fuera de los últimos 12 meses: fuera del informe (ni mes, ni total, ni producto).
    if (!month) continue;
    month.totalCents += row.totalCents;
    month.invoiceCount += 1;
    totalCents += row.totalCents;
    for (const line of row.lines ?? []) {
      if (line.totalCents <= 0) continue;
      const entry = byProduct.get(line.description) ?? { product: line.description, totalCents: 0, lineCount: 0 };
      entry.totalCents += line.totalCents;
      entry.lineCount += 1;
      byProduct.set(line.description, entry);
    }
  }
  const products = [...byProduct.values()].sort((a, b) => b.totalCents - a.totalCents);
  return { months, products, totalCents };
}

export async function getSubscriptionReport(db: ReportsDb): Promise<SubscriptionReport> {
  const grouped = await db.subscription.groupBy({ by: ["status"], _count: true });
  const byStatus = grouped
    .map((g) => ({ status: g.status, count: g._count }))
    .sort((a, b) => (a.status < b.status ? -1 : 1));
  return { byStatus, total: byStatus.reduce((sum, row) => sum + row.count, 0) };
}

type DomainRow = {
  id: string;
  domain: string;
  userId: string;
  status: string;
  expiresAt: Date | null;
};

export async function getExpiringDomains(db: ReportsDb, now = new Date(), days = 30): Promise<ExpiringDomainRow[]> {
  const limit = new Date(now.getTime() + days * DAY_MS);
  const rows = (await db.registeredDomain.findMany({
    where: { status: "active", expiresAt: { not: null, gte: now, lte: limit } },
    orderBy: { expiresAt: "asc" },
  })) as DomainRow[];
  return rows
    .filter((row) => row.expiresAt !== null)
    .map((row) => ({
      id: row.id,
      domain: row.domain,
      userId: row.userId,
      expiresAt: row.expiresAt as Date,
      daysLeft: Math.ceil(((row.expiresAt as Date).getTime() - now.getTime()) / DAY_MS),
    }));
}

export async function getReportsOverview(db: ReportsDb, now = new Date()): Promise<ReportsOverview> {
  const [aging, revenue, subscriptions, expiringDomains] = await Promise.all([
    getAgingReport(db, now),
    getRevenueReport(db, now),
    getSubscriptionReport(db),
    getExpiringDomains(db, now),
  ]);
  return { aging, revenue, subscriptions, expiringDomains };
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function agingToCsv(aging: AgingReport): string {
  const rows: (string | number)[][] = [
    ["Tramo (días vencidos)", "Facturas", "Importe (USD)"],
    ...aging.buckets.map((b) => [b.label, b.count, (b.totalCents / 100).toFixed(2)]),
    ["Total", aging.totalCount, (aging.totalCents / 100).toFixed(2)],
  ];
  return csv(rows);
}

export function revenueToCsv(revenue: RevenueReport): string {
  const rows: (string | number)[][] = [
    ["Mes", "Facturas pagadas", "Ingresos (USD)"],
    ...revenue.months.map((m) => [m.label, m.invoiceCount, (m.totalCents / 100).toFixed(2)]),
    ["Total", revenue.months.reduce((sum, m) => sum + m.invoiceCount, 0), (revenue.totalCents / 100).toFixed(2)],
    [],
    ["Producto", "Líneas", "Ingresos (USD)"],
    ...revenue.products.map((p) => [p.product, p.lineCount, (p.totalCents / 100).toFixed(2)]),
  ];
  return csv(rows);
}
