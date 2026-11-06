import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "lib/page-content.ts"), "utf8");

describe("page-content schema", () => {
  it("declara páginas públicas clave", () => {
    for (const path of ["/", "/web-hosting", "/vps", "/dedicated", "/about", "/contact", "/404"]) {
      assert.match(src, new RegExp(`path: "${path}"`));
    }
  });
  it("incluye FAQ y pasos editables en home", () => {
    assert.match(src, /faq1q/);
    assert.match(src, /step1Title/);
    assert.match(src, /trust1/);
  });
  it("validate helpers exportados", () => {
    assert.match(src, /export function validatePagePayload/);
    assert.match(src, /export function mergePagePayload/);
    assert.match(src, /export function defaultPayload/);
  });
});

describe("page-content validation (mirror)", () => {
  function isPlainText(value, max) {
    if (typeof value !== "string" || value.length > max) return false;
    return !/[<>]/.test(value);
  }
  it("rechaza HTML", () => {
    assert.equal(isPlainText("<b>x</b>", 100), false);
    assert.equal(isPlainText("Texto limpio", 100), true);
  });
});


describe("home CMS bindings", () => {
  it("renders the support label from PageContent instead of hardcoding it", () => {
    const home = readFileSync(join(root, "components/site/HomePage.tsx"), "utf8");
    assert.ok(/const statSupportLabel = useCopy\("statSupportLabel", "Apoyo técnico"\);/.test(home), "support label must read PageContent");
    assert.ok(/<span>\{statSupportLabel\}<\/span>/.test(home), "support label must render the CMS value");
    assert.ok(!/<span>Apoyo técnico<\/span>/.test(home), "support label must not be hardcoded");
  });
});
