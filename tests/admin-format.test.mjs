import test from "node:test";
import assert from "node:assert/strict";

const format = await import("../lib/admin-format.ts");

test("pageNumber acota la página pedida", () => {
  assert.equal(format.pageNumber(undefined, 5), 1);
  assert.equal(format.pageNumber("3", 5), 3);
  assert.equal(format.pageNumber("99", 5), 5);
  assert.equal(format.pageNumber("-2", 5), 1);
  assert.equal(format.pageNumber("abc", 5), 1);
  assert.equal(format.pageNumber("2", 0), 1);
});

test("searchTerm recorta y limita la búsqueda", () => {
  assert.equal(format.searchTerm(undefined), "");
  assert.equal(format.searchTerm("  ana@example.com "), "ana@example.com");
  assert.equal(format.searchTerm("x".repeat(200)).length, 80);
});

test("monthStart usa el mes de Puerto Rico, no el de UTC", () => {
  // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Puerto Rico.
  const now = new Date("2026-12-01T02:00:00Z");
  assert.equal(format.monthStart(now).toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(format.monthStart(now, 1).toISOString(), "2026-10-01T04:00:00.000Z");
  // Retroceder cruza el año.
  assert.equal(
    format.monthStart(new Date("2026-02-15T12:00:00Z"), 5).toISOString(),
    "2025-09-01T04:00:00.000Z",
  );
});

test("los estados desconocidos se muestran tal cual, sin romper", () => {
  assert.deepEqual(format.invoiceStatus("issued"), { label: "Por cobrar", tone: "warn" });
  assert.deepEqual(format.serviceStatus("raro"), { label: "raro", tone: "muted" });
  assert.equal(format.actionLabel("payment.confirmed"), "Pago confirmado");
  assert.equal(format.actionLabel("algo.nuevo"), "algo.nuevo");
});

test("money formatea céntimos con el código de moneda", () => {
  assert.match(format.money(399, "USD"), /3,99/);
  assert.match(format.money(399, "USD"), /USD/);
  assert.equal(format.money(100, "no-es-moneda"), "1.00 no-es-moneda");
});
