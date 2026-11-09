import test from "node:test";
import assert from "node:assert/strict";
import { reviewUploadedBranding } from "../lib/branding-upload.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

test("la subida de cliente borra bytes que no son imagen y conserva un PNG", async () => {
  const removed = [];
  const bad = await reviewUploadedBranding({
    slot: "logoUrl",
    bytes: svg,
    url: "https://example.public.blob.vercel-storage.com/branding/logoUrl/a.png",
    remove: async (url) => {
      removed.push(url);
    },
  });
  assert.equal(bad.ok, false);
  assert.equal(removed.length, 1);

  const good = await reviewUploadedBranding({
    slot: "logoUrl",
    bytes: png,
    url: "https://example.public.blob.vercel-storage.com/branding/logoUrl/b.png",
    remove: async () => {
      throw new Error("no debía borrar");
    },
  });
  assert.equal(good.ok, true);
});
