import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { getKbCategories, getPublicKbArticles } from "@/lib/content-kb-db";
import { KB_CATEGORIES } from "@/lib/content-kb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Base de conocimientos" };

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q, categoria } = await searchParams;
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);
  const [articles, categories] = await Promise.all([
    getPublicKbArticles(locale, { q, category: categoria }),
    getKbCategories(locale),
  ]);
  const known = KB_CATEGORIES.filter((c) => categories.includes(c));

  return (
    <main className="wrap kb-page">
      <header className="page-head">
        <div>
          <p className="studio-eyebrow">{dict.nav.knowledgeBase.toUpperCase()}</p>
          <h1>{dict.kb.title}</h1>
          <p className="muted page-head-sub">{dict.kb.lead}</p>
        </div>
      </header>

      <form className="kb-search" method="get" action="/kb" role="search">
        <label className="field">
          <span className="sr-only">{dict.kb.searchPlaceholder}</span>
          <input type="search" name="q" defaultValue={q ?? ""} placeholder={dict.kb.searchPlaceholder} />
        </label>
        <label className="field">
          <span className="sr-only">{dict.kb.category}</span>
          <select name="categoria" defaultValue={categoria ?? ""}>
            <option value="">{dict.kb.allCategories}</option>
            {known.map((c) => (
              <option key={c} value={c}>
                {dict.kb.categories[c as keyof typeof dict.kb.categories]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">{dict.kb.searchButton}</button>
      </form>

      {articles.length === 0 ? (
        <p className="muted">{q || categoria ? dict.kb.noResults : dict.kb.noArticles}</p>
      ) : (
        <ul className="kb-list">
          {articles.map((article) => (
            <li key={`${article.slug}-${article.locale}`} className="panel kb-card">
              <p className="studio-eyebrow">
                {dict.kb.categories[article.category as keyof typeof dict.kb.categories] ?? article.category}
              </p>
              <h2>
                <Link href={`/kb/${article.slug}`}>{article.title}</Link>
              </h2>
              <p className="muted">{article.body.split("\n").filter(Boolean)[0]?.slice(0, 200)}</p>
              <Link href={`/kb/${article.slug}`}>{dict.kb.readMore} →</Link>
            </li>
          ))}
        </ul>
      )}
      <p className="muted kb-help">{dict.kb.needHelp}</p>
    </main>
  );
}
