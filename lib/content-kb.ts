/**
 * Contenido editable y base de conocimientos (Fase 5, frente B).
 *
 * Módulo PURO (sin BD ni Next): la lógica que prueban los tests.
 * La lectura/escritura en BD vive en lib/content-kb-db.ts y en las rutas
 * /api/admin/content y /api/admin/kb.
 *
 * Decisión de diseño: ContentItem/ContentSection/KbArticle NO reutilizan
 * PageContent. PageContent es un CMS de campos fijos por ruta (una fila por
 * página, texto plano, sin idioma, sin orden y sin flag de publicado);
 * aquí hacen falta listas ordenables por tipo e idioma, con publicado,
 * búsqueda por texto/categoría y caída a español. Ver prisma/schema.prisma.
 */

export const CONTENT_KINDS = [
  "testimonial",
  "partner",
  "project",
  "faq",
  "page-section",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const KB_CATEGORIES = [
  "servicios",
  "facturacion",
  "dominios",
  "cuenta",
] as const;
export type KbCategory = (typeof KB_CATEGORIES)[number];

/** Sección del portal -> tipo de ContentItem que la alimenta. */
export const SECTION_KIND: Record<string, ContentKind> = {
  testimonials: "testimonial",
  partners: "partner",
  projects: "project",
  faq: "faq",
};

export const SECTION_KEYS = Object.keys(SECTION_KIND);

export type Locale = "es" | "en";

export function normalizeLocale(value: unknown): Locale {
  return value === "en" ? "en" : "es";
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function plain(value: string, max: number): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[<>]/.test(value);
}

export function validateContentItem(input: {
  kind: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
}): string | null {
  if (!(CONTENT_KINDS as readonly string[]).includes(input.kind)) return "Tipo de contenido no soportado.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 80) return "Slug inválido: solo minúsculas, números y guiones.";
  if (input.locale !== "es" && input.locale !== "en") return "Idioma no soportado (es/en).";
  if (!plain(input.title, 200)) return "Título inválido: texto plano, máx. 200.";
  if (!plain(input.body, 5000)) return "Cuerpo inválido: texto plano, máx. 5000.";
  return null;
}

export function validateKbArticle(input: {
  slug: string;
  locale: string;
  category: string;
  title: string;
  body: string;
}): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 80) return "Slug inválido: solo minúsculas, números y guiones.";
  if (input.locale !== "es" && input.locale !== "en") return "Idioma no soportado (es/en).";
  if (!(KB_CATEGORIES as readonly string[]).includes(input.category)) return "Categoría no soportada.";
  if (!plain(input.title, 200)) return "Título inválido: texto plano, máx. 200.";
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 12000 || /<[a-z][^>]*>/i.test(input.body)) {
    return "Cuerpo inválido: markdown sin HTML, máx. 12000.";
  }
  return null;
}

export type LocalizedRow = {
  slug: string;
  locale: string;
  published: boolean;
  order: number;
  [key: string]: unknown;
};

/**
 * Elige la fila en el idioma pedido; si no existe, cae a español.
 * Devuelve fellBack=true solo cuando se sirvió la versión española por
 * falta de traducción. El aviso de caída se muestra SOLO en admin, nunca
 * en público (las rutas públicas no exponen el flag).
 */
export function resolveLocalized<T extends LocalizedRow>(
  rows: T[],
  slug: string,
  locale: Locale,
): { row: T | null; fellBack: boolean } {
  const exact = rows.find((r) => r.slug === slug && r.locale === locale);
  if (exact) return { row: exact, fellBack: false };
  const es = rows.find((r) => r.slug === slug && r.locale === "es");
  if (es) return { row: es, fellBack: locale !== "es" };
  return { row: null, fellBack: false };
}

/** Solo publicados, en el idioma pedido con caída a español. */
export function publicRows<T extends LocalizedRow>(rows: T[], locale: Locale): T[] {
  const published = rows.filter((r) => r.published);
  const bySlug = new Map<string, T>();
  for (const row of published) {
    const prev = bySlug.get(row.slug);
    if (!prev) bySlug.set(row.slug, row);
    else if (prev.locale !== locale && row.locale === locale) bySlug.set(row.slug, row);
  }
  return [...bySlug.values()].sort((a, b) => a.order - b.order || String(a.slug).localeCompare(String(b.slug)));
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Búsqueda de la KB: por texto (título, cuerpo o categoría, sin tildes y
 * sin distinguir mayúsculas) y por categoría. Solo artículos publicados.
 */
export function searchKbArticles<T extends LocalizedRow & { title: string; body: string; category: string }>(
  rows: T[],
  locale: Locale,
  query: { q?: string; category?: string },
): T[] {
  let list = publicRows(rows, locale);
  const category = (query.category || "").trim();
  if (category) list = list.filter((r) => r.category === category);
  const q = fold((query.q || "").trim());
  if (q) {
    list = list.filter((r) => fold(`${r.title} ${r.body} ${r.category}`).includes(q));
  }
  return list;
}

export type ContentSectionRow = {
  key: string;
  locale: string;
  title: string;
  subtitle: string | null;
  visible: boolean;
};

/**
 * Secciones que se muestran en el portal: visible=true Y con al menos un
 * ítem publicado de su tipo (en cualquier idioma: la caída a español
 * garantiza que algo se renderice). Las vacías o sin publicar se ocultan
 * sin texto de relleno.
 */
export function visibleContentSections(
  sections: ContentSectionRow[],
  items: { kind: string; published: boolean }[],
  locale: Locale,
): { key: string; title: string; subtitle: string | null }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.published) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  const out: { key: string; title: string; subtitle: string | null }[] = [];
  for (const key of SECTION_KEYS) {
    const section =
      sections.find((s) => s.key === key && s.locale === locale) ??
      sections.find((s) => s.key === key && s.locale === "es");
    if (!section || !section.visible) continue;
    if ((counts.get(SECTION_KIND[key]) ?? 0) === 0) continue;
    out.push({ key, title: section.title, subtitle: section.subtitle });
  }
  return out;
}
