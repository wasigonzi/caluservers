import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  contrastRatio,
  changedSettingGroups,
} from "../lib/branding-preview.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Execute actual TSX and handlers with deterministic hook state, no browser or network.
function harness(extra = {}) {
  const cache = new Map();
  const states = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useId: () => "test-id",
    useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
  };
  function load(name) {
    const file = resolve(root, name);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    function localRequire(id) {
      if (id === "react") return hooks;
      if (id === "@vercel/blob/client")
        return {
          upload:
            extra.upload ??
            (() => {
              throw Error("Unexpected upload");
            }),
        };
      if (id === "next/link")
        return ({ children, ...props }) =>
          React.createElement("a", props, children);
      if (id.startsWith("@/") || id.startsWith(".")) {
        let target = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(file), id);
        if (!existsSync(target))
          target += existsSync(target + ".ts") ? ".ts" : ".tsx";
        return load(target);
      }
      return require(id);
    }
    runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        require: localRequire,
        URL,
        File,
        FormData,
        structuredClone,
        process,
        console,
        fetch:
          extra.fetch ??
          (() => {
            throw Error("Unexpected network");
          }),
      },
      { filename: file },
    );
    return module.exports;
  }
  return {
    load,
    render(Component, props) {
      cursor = 0;
      return Component(props);
    },
  };
}
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  const found = predicate(node) ? [node] : [];
  for (const child of React.Children.toArray(node.props?.children))
    found.push(...nodes(child, predicate));
  return found;
}

test("contrast uses WCAG ratio, short hex, AA boundary and invalid input", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#fff", "#000"), 21);
  assert.equal(contrastRatio("#123", "#123"), 1);
  assert.ok(contrastRatio("#ffffff", "#777777") < 4.5);
  assert.ok(contrastRatio("#ffffff", "#767676") >= 4.5);
  for (const invalid of ["red", "#gggggg", "#12345", "url(https://invalid)"])
    assert.equal(contrastRatio(invalid, "#fff"), null);
});
test("change summary compares actual groups without mutating saved state", () => {
  const saved = {
    branding: { siteName: "Original" },
    theme: { primary: "#fff" },
  };
  const draft = structuredClone(saved);
  draft.branding.siteName = "Draft";
  assert.deepEqual(changedSettingGroups(draft, saved), ["branding"]);
  assert.equal(saved.branding.siteName, "Original");
  assert.deepEqual(changedSettingGroups(saved, saved), []);
});
test("preview renders actual brand, escapes text, switches logo and rejects unsafe image URLs", () => {
  const h = harness();
  const Preview = h.load("components/admin/BrandingPreview.tsx").default;
  const settings = structuredClone(
    h.load("lib/site-settings.ts").DEFAULT_SITE_SETTINGS,
  );
  settings.branding.siteName = "<script>draft</script>";
  settings.branding.logoUrl = "https://cdn.example/desktop.png";
  settings.branding.logoMobileUrl = "https://cdn.example/mobile.png";
  let selected;
  const render = (device) =>
    h.render(Preview, {
      settings,
      device,
      onDeviceChange: (value) => {
        selected = value;
      },
    });
  const desktop = renderToStaticMarkup(render("desktop"));
  assert.match(desktop, /desktop.png/);
  assert.match(desktop, /&lt;script&gt;draft/);
  assert.ok(!desktop.includes("<script>"));
  assert.match(renderToStaticMarkup(render("mobile")), /mobile.png/);
  nodes(
    render("desktop"),
    (n) => n.props?.["aria-label"] === "Vista móvil",
  )[0].props.onClick();
  assert.equal(selected, "mobile");
  settings.branding.logoUrl = "javascript:alert(1)";
  const safe = renderToStaticMarkup(render("desktop"));
  assert.ok(!safe.includes("javascript:"));
  assert.match(safe, /logo-principal.svg/);
});
test("service finder selection changes real count, price and destination", () => {
  const h = harness();
  const Finder = h.load("components/site/ServiceFinder.tsx").default;
  const options = [
    { name: "Hosting", href: "/web-hosting", price: "$3.00", count: 2 },
    { name: "VPS", href: "/vps", price: "$8.00", count: 1 },
  ];
  const render = () => h.render(Finder, { options });
  assert.match(renderToStaticMarkup(render()), /2 planes disponibles/);
  nodes(render(), (n) => n.type === "button")[1].props.onClick();
  const html = renderToStaticMarkup(render());
  assert.match(html, /1 plan disponible/);
  assert.match(html, /\$8.00/);
  assert.match(html, /href="\/vps"/);
});
test("upload uses existing authenticated endpoint, preserves slot and reports true busy lifecycle", async () => {
  const calls = [];
  const changes = [];
  const busy = [];
  const h = harness({
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ url: "https://cdn.example/probe.png" }),
      };
    },
  });
  const Field = h.load("components/admin/BrandingAssetField.tsx").default;
  const props = {
    slot: "logoUrl",
    label: "Logo",
    value: "",
    blobConfigured: true,
    onChange: (v) => changes.push(v),
    onBusyChange: (v) => busy.push(v),
  };
  const render = () => h.render(Field, props);
  const file = nodes(render(), (n) => n.props?.type === "file")[0];
  await file.props.onChange({
    target: { files: [new File(["png"], "probe.png", { type: "image/png" })] },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/branding-upload");
  assert.equal(calls[0].options.body.get("slot"), "logoUrl");
  assert.deepEqual(changes, ["https://cdn.example/probe.png"]);
  assert.deepEqual(busy, [true, false]);
  assert.match(renderToStaticMarkup(render()), /aún no publicado/);
});
test("uploader rejects SVG, oversize and missing configuration before network", async () => {
  for (const variant of ["svg", "oversize", "unconfigured"]) {
    const h = harness();
    const Field = h.load("components/admin/BrandingAssetField.tsx").default;
    const props = {
      slot: "logoUrl",
      label: "Logo",
      value: "",
      blobConfigured: variant !== "unconfigured",
      onChange: () => assert.fail("Unexpected change"),
    };
    const file =
      variant === "oversize"
        ? new File([new Uint8Array(6 * 1024 * 1024)], "large.png", {
            type: "image/png",
          })
        : new File(["x"], variant === "svg" ? "bad.svg" : "ok.png", {
            type: variant === "svg" ? "image/svg+xml" : "image/png",
          });
    await nodes(
      h.render(Field, props),
      (n) => n.props?.type === "file",
    )[0].props.onChange({ target: { files: [file] } });
    assert.match(renderToStaticMarkup(h.render(Field, props)), /role="alert"/);
  }
});
test("removing an asset edits only the draft and never calls Blob deletion", () => {
  const h = harness();
  const Field = h.load("components/admin/BrandingAssetField.tsx").default;
  const changes = [];
  const props = {
    slot: "logoUrl",
    label: "Logo",
    value: "https://cdn.example/original.png",
    blobConfigured: true,
    onChange: (v) => changes.push(v),
  };
  const tree = h.render(Field, props);
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Quitar del borrador",
  )[0].props.onClick();
  assert.deepEqual(changes, [""]);
  assert.match(renderToStaticMarkup(h.render(Field, props)), /no se elimina/);
});
test("large file uses existing Blob client and real progress callback; failure preserves draft", async () => {
  let request;
  const changes = [];
  const busy = [];
  const h = harness({
    upload: async (...args) => {
      request = args;
      args[2].onUploadProgress({ percentage: 51 });
      throw Error("Upload failed");
    },
  });
  const Field = h.load("components/admin/BrandingAssetField.tsx").default;
  const props = {
    slot: "logoUrl",
    label: "Logo",
    value: "https://cdn.example/original.png",
    blobConfigured: true,
    onChange: (v) => changes.push(v),
    onBusyChange: (v) => busy.push(v),
  };
  await nodes(
    h.render(Field, props),
    (n) => n.props?.type === "file",
  )[0].props.onChange({
    target: {
      files: [
        new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
      ],
    },
  });
  assert.equal(request[2].handleUploadUrl, "/api/admin/branding-upload");
  assert.equal(JSON.parse(request[2].clientPayload).slot, "logoUrl");
  assert.deepEqual(changes, []);
  assert.deepEqual(busy, [true, false]);
  const html = renderToStaticMarkup(h.render(Field, props));
  assert.match(html, /Upload failed/);
  assert.match(html, /original.png/);
});
