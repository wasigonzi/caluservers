import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMERCIAL_CURRENCY,
  EXPLICIT_TAX_ENVIRONMENT_NOTE,
  ISSUER_CONTEXT,
  ISSUER_JURISDICTION,
  MISSING_CURRENCY_ERROR,
  MISSING_TAX_POLICY_ERROR,
  UNSUPPORTED_CURRENCY_ERROR,
  currencyMinorExponent,
  formatMinorAmount,
  invoiceStatusLabel,
  resolveBillingCurrency,
  serviceStatusLabel,
} from "../lib/money.ts";

test("399 unidades menores se leen como 3,99 USD", () => {
  assert.equal(COMMERCIAL_CURRENCY, "USD");
  assert.equal(currencyMinorExponent("USD"), 2);
  assert.equal(formatMinorAmount(399, "USD"), "3,99 USD");
  assert.equal(formatMinorAmount(399, "usd"), "3,99 USD");
  assert.equal(formatMinorAmount(100, "USD"), "1,00 USD");
  assert.equal(formatMinorAmount(123456, "USD"), "1.234,56 USD");
  assert.equal(formatMinorAmount(39900, "USD"), "399,00 USD");
  assert.notEqual(formatMinorAmount(399, "USD"), "399 USD");
  assert.doesNotMatch(formatMinorAmount(399, "USD"), /^399(\s|USD)/);
});

test("sin moneda no se inventa un importe en USD", () => {
  for (const value of ["", " ", undefined, null]) {
    const text = formatMinorAmount(399, value);
    assert.equal(text, "Importe sin moneda configurada");
    assert.doesNotMatch(text, /USD|3,99|399/);
  }
});

test("solo USD con dos decimales es moneda comercial", () => {
  assert.equal(currencyMinorExponent("JPY"), 0);
  assert.equal(currencyMinorExponent("BHD"), 3);
  assert.equal(currencyMinorExponent("EUR"), 2);
  for (const code of ["JPY", "BHD", "EUR", "XXX", "US"]) {
    const text = formatMinorAmount(399, code);
    assert.equal(text, "Moneda no soportada");
    assert.doesNotMatch(text, /3,99|399/);
  }
  assert.deepEqual(resolveBillingCurrency("USD"), { ok: true, currency: "USD" });
  assert.equal(resolveBillingCurrency("").ok, false);
  assert.equal(resolveBillingCurrency("EUR").ok, false);
  assert.doesNotMatch(MISSING_CURRENCY_ERROR, /3,99|\b399\b/);
  assert.doesNotMatch(UNSUPPORTED_CURRENCY_ERROR, /3,99 EUR|399/);
});

test("Puerto Rico no arrastra tasa, IVU ni datos fiscales inventados", () => {
  assert.equal(ISSUER_JURISDICTION, "Puerto Rico");
  const copy = [ISSUER_CONTEXT, MISSING_TAX_POLICY_ERROR, EXPLICIT_TAX_ENVIRONMENT_NOTE].join("\n");
  assert.match(copy, /Puerto Rico/);
  assert.match(copy, /proforma/i);
  assert.doesNotMatch(copy, /11[,.]5|IVU|razón social concreta|San Juan|EIN/i);
  assert.doesNotMatch(MISSING_TAX_POLICY_ERROR, /TAX_MODE=none/);
  assert.equal(invoiceStatusLabel("proforma", false), "Proforma, no cobrable");
  assert.equal(serviceStatusLabel("pending_provision"), "Pendiente de alta manual en este panel");
  assert.doesNotMatch(serviceStatusLabel("active"), /WHM/);
});
