import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { countKbView, getPublicKbArticle } from "@/lib/content-kb-db";
import MarkdownText from "@/components/site/MarkdownText";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const article = await getPublicKbArticle(slug, locale);
  return { title: article ? `${article.title} · Base de conocimientos` : "Base de conocimientos" };
}

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);
  const article = await getPublicKbArticle(slug, locale);
  // Sin publicar o inexistente: 404 (nunca se revela si existe en borrador).
  if (!article) notFound();
  await countKbView(article.slug, article.locale);

  return (
    <main className="wrap kb-page">
      <p>
        <Link href="/kb">← {dict.kb.back}</Link>
      </p>
      <header className="page-head">
        <div>
          <p className="studio-eyebrow">
            {dict.kb.categories[article.category as keyof typeof dict.kb.categories] ?? article.category}
          </p>
          <h1>{article.title}</h1>
          <p className="muted page-head-sub">
            {article.views + 1} {dict.kb.views}
          </p>
        </div>
      </header>
      <article className="panel kb-article">
        <MarkdownText text={article.body} />
      </article>
      <p className="muted kb-help">{dict.kb.needHelp}</p>
    </main>
  );
}
