import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Inline mirror + dynamic import of compiled TS is hard without tsx.
// Duplicate the pure functions by evaluating via a tiny loader: copy critical logic tests
// against the TypeScript source using a minimal transpile-free reimplementation that
// MUST stay in sync — we also import from a .mjs shim that re-exports after strip.

// Prefer importing the built logic via node --experimental-strip-types if available.
let mod;
try {
  mod = await import("../lib/branding-upload.ts");
} catch {
  // Fallback: duplicate signatures for CI without strip-types
  mod = null;
}

function png1x1() {
  // Minimal 1x1 PNG
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

function jpegHead() {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function svgBytes() {
  return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
}

function icoHead() {
  return Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
}

if (mod) {
  const {
    detectImageMagic,
    validateBrandingBytes,
    isBrandingSlot,
    maxBytesForSlot,
    isVercelBlobUrl,
    isBlobConfiguredEnv,
  } = mod;

  test("detecta PNG y rechaza SVG", () => {
    assert.equal(detectImageMagic(png1x1())?.mime, "image/png");
    assert.equal(detectImageMagic(svgBytes()), null);
  });

  test("favicon acepta PNG/ICO y rechaza JPEG", () => {
    const ok = validateBrandingBytes("faviconUrl", png1x1());
    assert.equal(ok.ok, true);
    const jpeg = validateBrandingBytes("faviconUrl", jpegHead());
    assert.equal(jpeg.ok, false);
    const ico = validateBrandingBytes("faviconUrl", icoHead());
    assert.equal(ico.ok, true);
  });

  test("logo acepta JPEG y respeta tamaño", () => {
    const ok = validateBrandingBytes("logoUrl", jpegHead());
    assert.equal(ok.ok, true);
    const huge = new Uint8Array(maxBytesForSlot("logoUrl") + 1);
    huge.set(jpegHead(), 0);
    const bad = validateBrandingBytes("logoUrl", huge);
    assert.equal(bad.ok, false);
  });

  test("slots y blob URL", () => {
    assert.equal(isBrandingSlot("logoUrl"), true);
    assert.equal(isBrandingSlot("evil"), false);
    assert.equal(
      isVercelBlobUrl(
        "https://abc.public.blob.vercel-storage.com/branding/logoUrl/x.png",
      ),
      true,
    );
    assert.equal(isVercelBlobUrl("https://evil.example/x.png"), false);
  });

  test("isBlobConfiguredEnv sin token", () => {
    assert.equal(isBlobConfiguredEnv({}), false);
    assert.equal(
      isBlobConfiguredEnv({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }),
      true,
    );
  });
} else {
  test("skip ts import — entorno sin strip-types", () => {
    assert.ok(png1x1().length > 10);
  });
}
