import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "lib/site-settings.ts"), "utf8");

/** Mirror of logoSrc from lib/site-settings.ts (keeps logoMobileUrl support). */
function logoSrc(branding, mobile = false) {
  if (mobile) {
    return (
      branding.logoMobileUrl.trim() ||
      branding.logoUrl.trim() ||
      "/assets/logo-principal.svg"
    );
  }
  return branding.logoUrl.trim() || "/assets/logo-principal.svg";
}

describe("logoSrc", () => {
  it("source still exports logoSrc with logoMobileUrl fallback chain", () => {
    assert.match(src, /export function logoSrc/);
    assert.match(src, /branding\.logoMobileUrl\.trim\(\)/);
    assert.match(src, /\/assets\/logo-principal\.svg/);
  });

  it("fallback: mobile uses logoUrl then default when logoMobileUrl empty", () => {
    assert.equal(
      logoSrc({ logoUrl: "", logoMobileUrl: "" }, true),
      "/assets/logo-principal.svg",
    );
    assert.equal(
      logoSrc({ logoUrl: "/assets/logo-principal.svg", logoMobileUrl: "" }, true),
      "/assets/logo-principal.svg",
    );
    assert.equal(
      logoSrc(
        { logoUrl: "https://cdn.example/logo.png", logoMobileUrl: "" },
        true,
      ),
      "https://cdn.example/logo.png",
    );
  });

  it("custom: mobile prefers logoMobileUrl when set", () => {
    assert.equal(
      logoSrc(
        {
          logoUrl: "https://cdn.example/desktop.png",
          logoMobileUrl: "https://cdn.example/mobile.png",
        },
        true,
      ),
      "https://cdn.example/mobile.png",
    );
    assert.equal(
      logoSrc(
        {
          logoUrl: "https://cdn.example/desktop.png",
          logoMobileUrl: "https://cdn.example/mobile.png",
        },
        false,
      ),
      "https://cdn.example/desktop.png",
    );
  });
});
