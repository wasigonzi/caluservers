// Informes (Fase 6, frente A): antigüedad por tramos, ingresos por mes y
// por producto, suscripciones por estado, dominios por expirar y CSV.
// BD falsa en memoria; sin datos, ceros honestos.
import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./helpers/load.mjs";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;

function fakeReportsDb(overrides = {}) {
  const state = {
    invoices: overrides.invoices ?? [],
    subscriptions: overrides.subscriptions ?? [],
    domains: overrides.domains ?? [],
  };
  return {
    state,
    customerInvoice: {
      findMany: async ({ where } = {}) => {
        let rows = state.invoices;
        if (where?.status?.in) rows = rows.filter((row) => where.status.in.includes(row.status));
        if (where?.status && typeof where.status === "string") rows = rows.filter((row) => row.status === where.status);
        return rows;
      },
    },
    subscription: {
      groupBy: async () => {
        const counts = new Map();
        for (const sub of state.subscriptions) counts.set(sub.status, (counts.get(sub.status) ?? 0) + 1);
        return [...counts.entries()].map(([status, count]) => ({ status, _count: count }));
      },
    },
    registeredDomain: {
      findMany: async ({ where } = {}) => {
        let rows = state.domains;
        if (where?.status) rows = rows.filter((row) => row.status === where.status);
        if (where?.expiresAt) {
          rows = rows.filter(
            (row) =>
              row.expiresAt !== null &&
              (!where.expiresAt.gte || row.expiresAt >= where.expiresAt.gte) &&
              (!where.expiresAt.lte || row.expiresAt <= where.expiresAt.lte),
          );
        }
        // Como el orderBy real (expiresAt asc).
        return [...rows].sort((a, b) => (a.expiresAt === null ? 1 : b.expiresAt === null ? -1 : a.expiresAt - b.expiresAt));
      },
    },
  };
}

const h = loader({});
const reports = h.load("lib/reports.ts");

/** Comparación profunda entre reinos: el módulo cargado vive en otro contexto vm. */
function eq(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

function invoice(overrides) {
  return {
    id: `inv_${Math.random().toString(36).slice(2, 8)}`,
    number: "PF-00000001",
    userId: "user-1",
    totalCents: 1000,
    currency: "USD",
    status: "issued",
    dueDate: null,
    createdAt: new Date(NOW),
    payment: null,
    lines: [],
    ...overrides,
  };
}

test("la antigüedad clasifica bien los tramos 0-30 / 31-60 / 61-90 / 90+", async () => {
  const db = fakeReportsDb({
    invoices: [
      invoice({ number: "PF-A", totalCents: 1000, dueDate: new Date(NOW.getTime() - 10 * DAY) }),
      invoice({ number: "PF-B", totalCents: 2000, dueDate: new Date(NOW.getTime() - 30 * DAY) }),
      invoice({ number: "PF-C", totalCents: 3000, dueDate: new Date(NOW.getTime() - 31 * DAY) }),
      invoice({ number: "PF-D", totalCents: 4000, dueDate: new Date(NOW.getTime() - 60 * DAY) }),
      invoice({ number: "PF-E", totalCents: 5000, dueDate: new Date(NOW.getTime() - 61 * DAY) }),
      invoice({ number: "PF-F", totalCents: 6000, dueDate: new Date(NOW.getTime() - 90 * DAY) }),
      invoice({ number: "PF-G", totalCents: 7000, dueDate: new Date(NOW.getTime() - 91 * DAY) }),
      invoice({ number: "PF-H", totalCents: 8000, dueDate: new Date(NOW.getTime() - 200 * DAY) }),
      // No vencidas o no impagas: fuera del informe.
      invoice({ number: "PF-I", totalCents: 9000, dueDate: new Date(NOW.getTime() + 5 * DAY) }),
      invoice({ number: "PF-J", totalCents: 10000, status: "paid", dueDate: new Date(NOW.getTime() - 40 * DAY) }),
      invoice({ number: "PF-K", totalCents: 11000, status: "void", dueDate: new Date(NOW.getTime() - 40 * DAY) }),
    ],
  });
  const aging = await reports.getAgingReport(db, NOW);
  eq(
    aging.buckets.map((b) => [b.bucket, b.count, b.totalCents]),
    [
      ["0-30", 2, 3000],
      ["31-60", 2, 7000],
      ["61-90", 2, 11000],
      ["90+", 2, 15000],
    ],
  );
  assert.equal(aging.totalCount, 8);
  assert.equal(aging.totalCents, 36000);
  assert.equal(aging.invoices[0].number, "PF-H");
  assert.equal(aging.invoices[0].daysOverdue, 200);
});

test("sin dueDate la factura vence en su creación", async () => {
  const db = fakeReportsDb({
    invoices: [invoice({ number: "PF-A", totalCents: 1000, dueDate: null, createdAt: new Date(NOW.getTime() - 45 * DAY) })],
  });
  const aging = await reports.getAgingReport(db, NOW);
  assert.equal(aging.totalCount, 1);
  assert.equal(aging.invoices[0].bucket, "31-60");
  assert.equal(aging.invoices[0].daysOverdue, 45);
});

test("ingresos por mes: últimos 12 meses con facturas pagadas y mes vacío en cero", async () => {
  const db = fakeReportsDb({
    invoices: [
      invoice({ status: "paid", totalCents: 1000, createdAt: new Date("2026-11-05T00:00:00Z"), payment: { createdAt: new Date("2026-11-05T00:00:00Z") }, lines: [{ description: "Plan Básico · ciclo mensual", totalCents: 1000 }] }),
      invoice({ status: "paid", totalCents: 2000, createdAt: new Date("2026-10-05T00:00:00Z"), payment: { createdAt: new Date("2026-10-20T00:00:00Z") }, lines: [{ description: "Plan Básico · ciclo mensual", totalCents: 2000 }] }),
      invoice({ status: "paid", totalCents: 5000, createdAt: new Date("2025-12-01T00:00:00Z"), payment: { createdAt: new Date("2025-12-01T00:00:00Z") }, lines: [{ description: "Plan Pro · ciclo mensual", totalCents: 5000 }] }),
      // Impaga: no es ingreso.
      invoice({ status: "issued", totalCents: 9999, createdAt: new Date("2026-11-05T00:00:00Z") }),
      // Más vieja que 12 meses: fuera del informe.
      invoice({ status: "paid", totalCents: 7777, createdAt: new Date("2025-10-01T00:00:00Z"), payment: { createdAt: new Date("2025-10-01T00:00:00Z") } }),
    ],
  });
  const revenue = await reports.getRevenueReport(db, NOW);
  assert.equal(revenue.months.length, 12);
  assert.equal(revenue.months[0].month, "2025-12");
  assert.equal(revenue.months[11].month, "2026-11");
  const byMonth = new Map(revenue.months.map((m) => [m.month, m]));
  assert.equal(byMonth.get("2025-12").totalCents, 5000);
  assert.equal(byMonth.get("2026-10").totalCents, 2000);
  assert.equal(byMonth.get("2026-11").totalCents, 1000);
  assert.equal(byMonth.get("2026-09").totalCents, 0);
  assert.equal(byMonth.get("2026-09").invoiceCount, 0);
  assert.equal(revenue.totalCents, 8000);
  eq(
    revenue.products.map((p) => [p.product, p.totalCents, p.lineCount]),
    [
      ["Plan Pro · ciclo mensual", 5000, 1],
      ["Plan Básico · ciclo mensual", 3000, 2],
    ],
  );
});

test("las líneas de descuento no cuentan como producto", async () => {
  const db = fakeReportsDb({
    invoices: [
      invoice({
        status: "paid",
        totalCents: 800,
        createdAt: new Date("2026-11-05T00:00:00Z"),
        payment: { createdAt: new Date("2026-11-05T00:00:00Z") },
        lines: [
          { description: "Plan Básico · ciclo mensual", totalCents: 1000 },
          { description: "Descuento BIENVENIDA", totalCents: -200 },
        ],
      }),
    ],
  });
  const revenue = await reports.getRevenueReport(db, NOW);
  eq(revenue.products, [{ product: "Plan Básico · ciclo mensual", totalCents: 1000, lineCount: 1 }]);
});

test("suscripciones por estado y dominios por expirar en 30 días", async () => {
  const db = fakeReportsDb({
    subscriptions: [
      { status: "active" },
      { status: "active" },
      { status: "past_due" },
      { status: "cancelled" },
    ],
    domains: [
      { id: "d1", domain: "pronto.com", userId: "user-1", status: "active", expiresAt: new Date(NOW.getTime() + 10 * DAY) },
      { id: "d2", domain: "hoy.com", userId: "user-1", status: "active", expiresAt: new Date(NOW.getTime() + 1 * DAY) },
      { id: "d3", domain: "lejos.com", userId: "user-1", status: "active", expiresAt: new Date(NOW.getTime() + 31 * DAY) },
      { id: "d4", domain: "vencido.com", userId: "user-1", status: "active", expiresAt: new Date(NOW.getTime() - 1 * DAY) },
      { id: "d5", domain: "sinexpirar.com", userId: "user-1", status: "active", expiresAt: null },
      { id: "d6", domain: "cancelado.com", userId: "user-1", status: "cancelled", expiresAt: new Date(NOW.getTime() + 5 * DAY) },
    ],
  });
  const overview = await reports.getReportsOverview(db, NOW);
  eq(overview.subscriptions.byStatus, [
    { status: "active", count: 2 },
    { status: "cancelled", count: 1 },
    { status: "past_due", count: 1 },
  ]);
  assert.equal(overview.subscriptions.total, 4);
  eq(
    overview.expiringDomains.map((d) => d.domain),
    ["hoy.com", "pronto.com"],
  );
  assert.equal(overview.expiringDomains[0].daysLeft, 1);
});

test("sin datos, ceros honestos", async () => {
  const db = fakeReportsDb();
  const overview = await reports.getReportsOverview(db, NOW);
  assert.equal(overview.aging.totalCount, 0);
  assert.equal(overview.aging.totalCents, 0);
  assert.ok(overview.aging.buckets.every((b) => b.count === 0 && b.totalCents === 0));
  assert.equal(overview.revenue.totalCents, 0);
  assert.equal(overview.revenue.months.length, 12);
  eq(overview.revenue.products, []);
  eq(overview.subscriptions.byStatus, []);
  assert.equal(overview.subscriptions.total, 0);
  eq(overview.expiringDomains, []);
});

test("CSV de antigüedad e ingresos con cabeceras en español", () => {  const agingCsv = reports.agingToCsv({
    buckets: [
      { bucket: "0-30", label: "0–30 días", count: 2, totalCents: 3000 },
      { bucket: "31-60", label: "31–60 días", count: 0, totalCents: 0 },
      { bucket: "61-90", label: "61–90 días", count: 1, totalCents: 5000 },
      { bucket: "90+", label: "Más de 90 días", count: 0, totalCents: 0 },
    ],
    totalCount: 3,
    totalCents: 8000,
    invoices: [],
  });
  assert.match(agingCsv, /^Tramo \(días vencidos\);Facturas;Importe \(USD\)\r\n/);
  assert.match(agingCsv, /0–30 días;2;30\.00\r\n/);
  assert.match(agingCsv, /Total;3;80\.00\r\n$/);

  const revenueCsv = reports.revenueToCsv({
    months: [
      { month: "2026-10", label: "octubre de 2026", totalCents: 2000, invoiceCount: 1 },
      { month: "2026-11", label: "noviembre de 2026", totalCents: 1000, invoiceCount: 1 },
    ],
    products: [{ product: "Plan Básico · ciclo mensual", totalCents: 3000, lineCount: 2 }],
    totalCents: 3000,
  });
  assert.match(revenueCsv, /^Mes;Facturas pagadas;Ingresos \(USD\)\r\n/);
  assert.match(revenueCsv, /octubre de 2026;1;20\.00\r\n/);
  assert.match(revenueCsv, /Producto;Líneas;Ingresos \(USD\)\r\n/);
  assert.match(revenueCsv, /Plan Básico · ciclo mensual;2;30\.00\r\n$/);
});

// --- Ruta GET /api/admin/reports/export: CSV con permiso, 403 sin él ---

function exportRouteLoader({ allow }) {
  const db = fakeReportsDb({
    invoices: [
      invoice({ number: "PF-A", totalCents: 1000, dueDate: new Date(NOW.getTime() - 10 * DAY) }),
    ],
  });
  const hh = loader({
    "@/lib/auth": {
      requirePermission: async (permission) => {
        assert.equal(permission, "reports:view");
        if (!allow) throw new Error("Sin permiso.");
        return { email: "admin@example.com", permissions: ["reports:view"] };
      },
    },
    "@/lib/db": { db },
  });
  return hh.load("app/api/admin/reports/export/route.ts");
}

function fakeExportRequest(kind) {
  return { nextUrl: new URL(`http://admin.local/api/admin/reports/export?kind=${kind}`) };
}

test("export CSV de antigüedad con permiso y 403 sin él", async () => {
  const allowed = exportRouteLoader({ allow: true });
  const res = await allowed.GET(fakeExportRequest("aging"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /informe-aging\.csv/);
  const body = await res.text();
  assert.match(body, /^Tramo \(días vencidos\);Facturas;Importe \(USD\)/);
  assert.match(body, /0–30 días;1;10\.00/);

  const denied = exportRouteLoader({ allow: false });
  const forbidden = await denied.GET(fakeExportRequest("aging"));
  assert.equal(forbidden.status, 403);

  const badKind = await allowed.GET(fakeExportRequest("otro"));
  assert.equal(badKind.status, 400);
});

test("export CSV de ingresos con permiso", async () => {
  const allowed = exportRouteLoader({ allow: true });
  const res = await allowed.GET(fakeExportRequest("revenue"));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /^Mes;Facturas pagadas;Ingresos \(USD\)/);
});
