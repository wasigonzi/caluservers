// i18n ES/EN y diseños del portal (Fase 5, frente B).
// Módulos puros con el loader; el cableado se comprueba a nivel de fuente,
// como tests/page-content.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loader } from "./helpers/load.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const h = loader({});
const i18n = h.load("lib/i18n/index.ts");
const portalTheme = h.load("lib/portal-theme.ts");
const contentKb = h.load("lib/content-kb.ts");

test("diccionarios es/en: mismas claves y traducción del portal", () => {
  const { getDictionary, t, normalizeLocale } = i18n;
  const es = getDictionary("es");
  const en = getDictionary("en");
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(es.portal).sort(), Object.keys(en.portal).sort());
  assert.deepEqual(Object.keys(es.kb).sort(), Object.keys(en.kb).sort());
  assert.equal(t("es", "portal.dashboard"), "Resumen");
  assert.equal(t("en", "portal.dashboard"), "Overview");
  assert.equal(t("en", "kb.title"), "Knowledge base");
  assert.equal(t("es", "kb.title"), "Base de conocimientos");
  assert.equal(t("en", "portal.themeMidnight"), "Midnight");
  // Clave inexistente: se devuelve la ruta, nunca se rompe.
  assert.equal(t("en", "portal.noExiste"), "portal.noExiste");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("fr"), "es");
  assert.equal(normalizeLocale(undefined), "es");
  assert.equal(normalizeLocale("es"), "es");
});

test("idioma cae a español sin traducción", () => {
  const rows = [
    { slug: "a", locale: "es", title: "A", body: "B", order: 0, published: true },
  ];
  const { row, fellBack } = contentKb.resolveLocalized(rows, "a", "en");
  assert.equal(row.locale, "es");
  assert.equal(fellBack, true);
  // Con traducción en inglés no hay caída.
  const rows2 = [
    ...rows,
    { slug: "a", locale: "en", title: "A EN", body: "B", order: 0, published: true },
  ];
  const exact = contentKb.resolveLocalized(rows2, "a", "en");
  assert.equal(exact.row.locale, "en");
  assert.equal(exact.fellBack, false);
});

test("diseño elegido persiste: el del cliente manda, si no el del portal", () => {
  const { resolvePortalTheme, normalizePortalTheme, normalizePortalDensity, portalThemeClasses } = portalTheme;
  assert.equal(resolvePortalTheme("ocean", "default"), "ocean");
  assert.equal(resolvePortalTheme("midnight", "ocean"), "midnight");
  // Tema del cliente inválido: cae al preset por defecto del portal.
  assert.equal(resolvePortalTheme("inventado", "ocean"), "ocean");
  assert.equal(resolvePortalTheme("", "midnight"), "midnight");
  assert.equal(resolvePortalTheme("inventado", "inventado"), "default");
  assert.equal(normalizePortalTheme("ocean"), "ocean");
  assert.equal(normalizePortalTheme("otro"), "default");
  // Densidad: comfortable/compact/relaxed; inválida → comfortable.
  assert.equal(normalizePortalDensity("compact"), "compact");
  assert.equal(normalizePortalDensity("relaxed"), "relaxed");
  assert.equal(normalizePortalDensity("comfortable"), "comfortable");
  assert.equal(normalizePortalDensity("alta"), "comfortable");
  // Las clases aplican tema y densidad a la vez.
  assert.equal(portalThemeClasses("ocean", "compact"), "portal-theme-ocean portal-density-compact");
  assert.equal(portalThemeClasses("midnight", "relaxed"), "portal-theme-midnight portal-density-relaxed");
});

test("los tres diseños se distinguen de verdad en el CSS del portal", () => {
  const css = src("app/account.css");
  for (const theme of ["default", "ocean", "midnight"]) {
    assert.ok(css.includes(`.account-app.portal-theme-${theme}`), theme);
  }
  // Paletas distintas por tema (no solo el acento).
  assert.match(css, /\.portal-theme-ocean[^{]*\{[^}]*#06101c/);
  assert.match(css, /\.portal-theme-midnight[^{]*\{[^}]*#04080f/);
  assert.match(css, /\.portal-theme-midnight \.panel[^{]*\{[^}]*border-radius:28px/);
  assert.match(css, /\.portal-theme-ocean \.panel[^{]*\{[^}]*border-radius:14px/);
  // Densidades con paddings distintos.
  assert.match(css, /\.portal-density-compact\{[^}]*--portal-pad:14px/);
  assert.match(css, /\.portal-density-relaxed\{[^}]*--portal-pad:30px/);
});

test("cableado: preferencias del cliente se guardan y el portal las aplica", () => {
  const prefs = src("app/api/account/preferences/route.ts");
  assert.match(prefs, /db\.user\.update/);
  assert.match(prefs, /portalTheme/);
  assert.match(prefs, /portalDensity/);
  assert.match(prefs, /calu-locale/);
  const layout = src("app/cuenta/(panel)/layout.tsx");
  assert.match(layout, /portalTheme=\{resolvePortalTheme/);
  assert.match(layout, /portalDensity=\{normalizePortalDensity/);
  assert.match(layout, /locale=\{locale\}/);
  const perfil = src("app/cuenta/(panel)/perfil/page.tsx");
  assert.match(perfil, /PortalPreferencesForm/);
  const shell = src("components/account/AccountShell.tsx");
  assert.match(shell, /portalThemeClasses\(portalTheme, portalDensity\)/);
  assert.match(shell, /LanguageSelector/);
});

test("cableado: admin, KB pública y textos legales", () => {
  const auth = src("lib/auth.ts");
  assert.match(auth, /"kb:write"/);
  const shell = src("components/admin/AdminShell.tsx");
  assert.match(shell, /\/admin\/contenido/);
  assert.match(shell, /\/admin\/kb/);
  assert.match(shell, /permission: "kb:write"/);
  const kb = src("app/(site)/kb/page.tsx");
  assert.match(kb, /getPublicKbArticles/);
  assert.match(kb, /categoria/);
  const article = src("app/(site)/kb/[slug]/page.tsx");
  assert.match(article, /notFound\(\)/);
  // Legales: siguen en español con aviso solo cuando el idioma es inglés.
  const notice = src("components/site/LegalLanguageNotice.tsx");
  assert.match(notice, /locale !== "en"/);
  assert.match(notice, /legal\.englishPending/);
  for (const page of ["terms", "privacy", "aup"]) {
    assert.match(src(`app/(site)/${page}/page.tsx`), /LegalLanguageNotice/);
  }
  // Selector de idioma en el shell público.
  assert.match(src("components/site/SiteShell.tsx"), /LanguageSelector/);
  assert.match(src("app/(site)/layout.tsx"), /getRequestLocale/);
});
