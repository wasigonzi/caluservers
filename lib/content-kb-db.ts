import "server-only";
import { db } from "@/lib/db";
import { reportDbError } from "@/lib/db-errors";
import {
  publicRows,
  searchKbArticles,
  visibleContentSections,
  type ContentSectionRow,
  type Locale,
} from "@/lib/content-kb";

export type KbArticleRow = {
  slug: string;
  locale: string;
  category: string;
  title: string;
  body: string;
  order: number;
  published: boolean;
  views: number;
};

export type ContentItemRow = {
  kind: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
  fieldsJson: unknown;
  order: number;
  published: boolean;
};

/** Artículos publicados de la KB en el idioma pedido (caída a español). */
export async function getPublicKbArticles(
  locale: Locale,
  query: { q?: string; category?: string } = {},
): Promise<KbArticleRow[]> {
  try {
    const rows = await db.kbArticle.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
    });
    return searchKbArticles(rows as KbArticleRow[], locale, query);
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return [];
  }
}

/** Un artículo publicado por slug (caída a español); null si no existe o no está publicado. */
export async function getPublicKbArticle(
  slug: string,
  locale: Locale,
): Promise<(KbArticleRow & { fellBack: boolean }) | null> {
  try {
    const rows = await db.kbArticle.findMany({
      where: { slug, published: true },
    });
    const exact = rows.find((r) => r.locale === locale);
    const row = exact ?? rows.find((r) => r.locale === "es") ?? null;
    if (!row) return null;
    return { ...(row as KbArticleRow), fellBack: !exact && locale !== "es" };
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return null;
  }
}

/** Suma una lectura al artículo (best effort: nunca rompe la página). */
export async function countKbView(slug: string, locale: string): Promise<void> {
  try {
    await db.kbArticle.updateMany({
      where: { slug, locale },
      data: { views: { increment: 1 } },
    });
  } catch {
    // Best effort.
  }
}

/** Categorías con artículos publicados (para el filtro de /kb). */
export async function getKbCategories(locale: Locale): Promise<string[]> {
  const articles = await getPublicKbArticles(locale);
  return [...new Set(articles.map((a) => a.category))];
}

/** Ítems publicados de un tipo en el idioma pedido (caída a español). */
export async function getPublishedContentItems(
  kind: string,
  locale: Locale,
): Promise<ContentItemRow[]> {
  try {
    const rows = await db.contentItem.findMany({
      where: { kind, published: true },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
    });
    return publicRows(rows as ContentItemRow[], locale);
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return [];
  }
}

/** Secciones visibles del portal con sus ítems publicados. */
export async function getPortalContentSections(locale: Locale): Promise<
  { key: string; title: string; subtitle: string | null; items: ContentItemRow[] }[]
> {
  try {
    const [sections, items] = await Promise.all([
      db.contentSection.findMany(),
      db.contentItem.findMany({ where: { published: true } }),
    ]);
    const visible = visibleContentSections(
      sections as ContentSectionRow[],
      items.map((i) => ({ kind: i.kind, published: i.published })),
      locale,
    );
    const out: { key: string; title: string; subtitle: string | null; items: ContentItemRow[] }[] = [];
    for (const section of visible) {
      const kind =
        section.key === "testimonials"
          ? "testimonial"
          : section.key === "partners"
            ? "partner"
            : section.key === "projects"
              ? "project"
              : "faq";
      out.push({ ...section, items: await getPublishedContentItems(kind, locale) });
    }
    return out.filter((s) => s.items.length > 0);
  } catch (error) {
    reportDbError(error, process.env.DATABASE_URL);
    return [];
  }
}
