// Contenido editable y base de conocimientos (Fase 5, frente B).
// Lógica pura con el loader de tests/helpers/load.mjs; las rutas admin se
// prueban con la BD mockeada, como tests/rbac.test.mjs.
// Todos los valores son señuelos locales.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loader } from "./helpers/load.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const h = loader({});
const contentKb = h.load("lib/content-kb.ts");
const {
  visibleContentSections,
  publicRows,
  searchKbArticles,
  resolveLocalized,
  validateContentItem,
  validateKbArticle,
} = contentKb;

class FakeResponse {
  constructor(data, status) {
    this.data = data;
    this.status = status;
  }
  async json() {
    return this.data;
  }
}

function fakeReq({ params = {}, body = null } = {}) {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
    json: async () => body,
  };
}

function routeSetup({ permission = true } = {}) {
  class AuthorizationError extends Error {}
  const calls = { db: [] };
  const db = {
    contentItem: {
      findMany: async () => {
        calls.db.push("contentItem.findMany");
        return [
          { id: "1", kind: "testimonial", slug: "a", locale: "es", title: "A", body: "B", fieldsJson: null, order: 0, published: true },
        ];
      },
    },
    contentSection: { findMany: async () => [] },
    kbArticle: {
      findMany: async () => {
        calls.db.push("kbArticle.findMany");
        return [
          { id: "k1", slug: "como-pagar", locale: "es", category: "facturacion", title: "Pagar", body: "Paga la factura", order: 0, published: true, views: 0 },
        ];
      },
    },
  };
  const hh = loader({
    "@/lib/db": { db },
    "@/lib/auth": {
      AuthorizationError,
      requirePermission: async (perm) => {
        if (!permission) throw new AuthorizationError(perm);
      },
    },
    "@/lib/request": { trustedWrite: () => true },
    "@/lib/client-error": { clientSafeError: (e) => ({ body: { error: e.message }, status: 500 }) },
    "next/server": {
      NextResponse: class {
        static json(data, init) {
          return new FakeResponse(data, init?.status ?? 200);
        }
      },
      NextRequest: class {},
    },
  });
  return {
    contentRoute: hh.load("app/api/admin/content/route.ts"),
    kbRoute: hh.load("app/api/admin/kb/route.ts"),
    calls,
  };
}

// Las listas vienen de otro realm (vm): se comparan como texto, no con deepEqual.
const slugs = (list) => [...list.map((r) => r.slug)];
const sectionKeys = (list) => [...list.map((s) => s.key)];

test("sección vacía o sin publicar no se muestra en el portal", () => {
  const sections = [
    { key: "testimonials", locale: "es", title: "Testimonios", subtitle: null, visible: true },
    { key: "faq", locale: "es", title: "FAQ", subtitle: null, visible: true },
    { key: "partners", locale: "es", title: "Socios", subtitle: null, visible: false },
  ];
  // Sin ítems publicados: nada visible.
  assert.equal(visibleContentSections(sections, [], "es").length, 0);
  // Solo un borrador: sigue sin verse.
  assert.equal(
    visibleContentSections(sections, [{ kind: "testimonial", published: false }], "es").length,
    0,
  );
  // Un testimonio publicado: solo esa sección.
  const visible = visibleContentSections(
    sections,
    [
      { kind: "testimonial", published: true },
      { kind: "partner", published: true },
    ],
    "es",
  );
  assert.deepEqual(sectionKeys(visible), ["testimonials"]);
});

test("artículo sin publicar no se ve en público", () => {
  const rows = [
    { slug: "a", locale: "es", category: "cuenta", title: "A", body: "B", order: 0, published: true },
    { slug: "b", locale: "es", category: "cuenta", title: "B", body: "C", order: 1, published: false },
  ];
  assert.deepEqual(slugs(publicRows(rows, "es")), ["a"]);
  assert.deepEqual(slugs(searchKbArticles(rows, "es", {})), ["a"]);
});

test("búsqueda KB por texto (sin tildes) y por categoría", () => {
  const rows = [
    { slug: "pagar", locale: "es", category: "facturacion", title: "Cómo pagar una factura", body: "Paga con PayPal.", order: 0, published: true },
    { slug: "dominio", locale: "es", category: "dominios", title: "Renovar un dominio", body: "Renueva antes del vencimiento.", order: 1, published: true },
    { slug: "contratar", locale: "es", category: "servicios", title: "Contratar un servicio", body: "Elige tu plan.", order: 2, published: true },
  ];
  assert.deepEqual(slugs(searchKbArticles(rows, "es", { q: "factura" })), ["pagar"]);
  // "facturación" con tilde en el texto se encuentra con "facturacion" sin tilde.
  assert.deepEqual(slugs(searchKbArticles(rows, "es", { q: "FACTURACION" })), ["pagar"]);
  assert.deepEqual(slugs(searchKbArticles(rows, "es", { category: "dominios" })), ["dominio"]);
  assert.deepEqual(
    slugs(searchKbArticles(rows, "es", { q: "renovar", category: "servicios" })),
    [],
  );
});

test("idioma cae a español sin traducción (aviso solo en admin)", () => {
  const rows = [
    { slug: "pagar", locale: "es", title: "Pagar", body: "B", order: 0, published: true },
  ];
  const en = resolveLocalized(rows, "pagar", "en");
  assert.equal(en.row?.locale, "es");
  assert.equal(en.fellBack, true);
  const es = resolveLocalized(rows, "pagar", "es");
  assert.equal(es.fellBack, false);
  assert.equal(resolveLocalized(rows, "no-existe", "en").row, null);
});

test("validación rechaza HTML y tipos/categorías no soportados", () => {
  assert.match(validateContentItem({ kind: "testimonial", slug: "a", locale: "es", title: "<b>x</b>", body: "ok" }), /Título/);
  assert.match(validateContentItem({ kind: "inventado", slug: "a", locale: "es", title: "ok", body: "ok" }), /Tipo/);
  assert.equal(validateContentItem({ kind: "faq", slug: "q-1", locale: "en", title: "Q", body: "A" }), null);
  assert.match(validateKbArticle({ slug: "a", locale: "es", category: "otra", title: "T", body: "B" }), /Categoría/);
  assert.match(validateKbArticle({ slug: "a", locale: "es", category: "cuenta", title: "T", body: "<p>B</p>" }), /Cuerpo/);
  assert.equal(validateKbArticle({ slug: "a", locale: "es", category: "cuenta", title: "T", body: "Texto **con markdown**." }), null);
});

test("admin sin permiso content:write → 403 en /api/admin/content", async () => {
  const { contentRoute, calls } = routeSetup({ permission: false });
  const res = await contentRoute.GET(fakeReq());
  assert.equal(res.status, 403);
  assert.equal(calls.db.length, 0);
});

test("admin sin permiso kb:write → 403 en /api/admin/kb", async () => {
  const { kbRoute, calls } = routeSetup({ permission: false });
  const res = await kbRoute.GET(fakeReq());
  assert.equal(res.status, 403);
  assert.equal(calls.db.length, 0);
});

test("admin con permiso lista el contenido y la KB", async () => {
  const { contentRoute, kbRoute, calls } = routeSetup({ permission: true });
  const content = await contentRoute.GET(fakeReq());
  assert.equal(content.status, 200);
  assert.equal(content.data.items.length, 1);
  const kb = await kbRoute.GET(fakeReq());
  assert.equal(kb.status, 200);
  assert.equal(kb.data.articles.length, 1);
  assert.ok(calls.db.includes("contentItem.findMany"));
  assert.ok(calls.db.includes("kbArticle.findMany"));
});

test("migración siembra permisos, secciones y KB inicial", () => {
  const sql = readFileSync(join(root, "prisma/migrations/20261118060000_content_kb/migration.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "ContentItem"/);
  assert.match(sql, /CREATE TABLE "ContentSection"/);
  assert.match(sql, /CREATE TABLE "KbArticle"/);
  assert.match(sql, /'perm_kb_write', 'kb:write'/);
  assert.match(sql, /ALTER TABLE "user" ADD COLUMN "portalTheme"/);
  assert.match(sql, /ALTER TABLE "user" ADD COLUMN "portalDensity"/);
  for (const slug of ["como-contratar-un-servicio", "como-pagar-una-factura", "como-renovar-un-dominio", "como-recuperar-la-contrasena"]) {
    assert.ok(sql.includes(slug), slug);
  }
  // Los ítems de ejemplo están desactivados y marcados como ejemplo.
  assert.match(sql, /\[Ejemplo\]/);
  assert.match(sql, /published.*false|0, false/g);
  // El artículo de contraseña no promete envío de correo.
  assert.match(sql, /el restablecimiento por correo no está activo/);
});
