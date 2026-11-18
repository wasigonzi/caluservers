"use client";

import { useMemo, useState } from "react";

type Article = {
  id: string;
  slug: string;
  locale: string;
  category: string;
  title: string;
  body: string;
  order: number;
  published: boolean;
  views: number;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "servicios", label: "Servicios" },
  { value: "facturacion", label: "Facturación" },
  { value: "dominios", label: "Dominios" },
  { value: "cuenta", label: "Cuenta" },
];

export default function KbManager({ initialArticles }: { initialArticles: Article[] }) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [locale, setLocale] = useState("es");
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState({ slug: "", category: "servicios", title: "", body: "", order: "0", published: true });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => articles.filter((a) => a.locale === locale),
    [articles, locale],
  );
  const missingEn = useMemo(() => {
    const slugs = [...new Set(articles.map((a) => a.slug))];
    return slugs.filter((slug) => {
      const es = articles.some((a) => a.slug === slug && a.locale === "es");
      const en = articles.some((a) => a.slug === slug && a.locale === "en");
      return es && !en;
    });
  }, [articles]);

  function startNew() {
    setEditing(null);
    setForm({ slug: "", category: "servicios", title: "", body: "", order: "0", published: true });
  }
  function startEdit(article: Article) {
    setEditing(article);
    setForm({
      slug: article.slug,
      category: article.category,
      title: article.title,
      body: article.body,
      order: String(article.order),
      published: article.published,
    });
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/kb", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          slug: form.slug.trim(),
          locale,
          category: form.category,
          title: form.title,
          body: form.body,
          order: Number(form.order) || 0,
          published: form.published,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
      const saved = data.article as Article;
      setArticles((prev) => [...prev.filter((a) => a.id !== saved.id), saved]);
      setMessage("Artículo guardado.");
      startNew();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(article: Article) {
    if (!window.confirm(`¿Eliminar «${article.title}» (${article.locale})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/kb?id=${encodeURIComponent(article.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar.");
      setArticles((prev) => prev.filter((a) => a.id !== article.id));
      setMessage("Artículo eliminado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-columns">
      <section className="panel" aria-labelledby="kb-list">
        <h2 id="kb-list">Artículos</h2>
        <div className="content-filters">
          <label className="field">
            Idioma
            <select value={locale} onChange={(e) => { setLocale(e.target.value); startNew(); }}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" className="btn secondary" onClick={startNew}>Nuevo artículo</button>
        </div>
        {missingEn.length > 0 ? (
          <p className="notice" role="status">
            Sin traducción al inglés (se sirve en español): {missingEn.join(", ")}.
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <p className="muted">Sin artículos en este idioma.</p>
        ) : (
          <ul className="plain-list">
            {filtered.map((article) => (
              <li key={article.id}>
                <span>
                  <strong>{article.title}</strong>
                  <span className="muted"> · {article.slug} · {article.category} · {article.views} lecturas · {article.published ? "Publicado" : "Borrador"}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="btn secondary" onClick={() => startEdit(article)}>Editar</button>
                  <button type="button" className="btn secondary" onClick={() => void remove(article)} disabled={busy}>Eliminar</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="kb-form">
        <h2 id="kb-form">{editing ? "Editar artículo" : "Nuevo artículo"}</h2>
        <label className="field">Slug
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="como-hacer-algo" />
        </label>
        <label className="field">Categoría
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="field">Título
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="field">Cuerpo (markdown, sin HTML)
          <textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </label>
        <label className="field">Orden
          <input inputMode="numeric" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publicado
        </label>
        <p className="form-hint">Solo los publicados se ven en /kb. El artículo de recuperación de contraseña no debe prometer envío de correo: el reset por correo hoy no está activo.</p>
        <button type="button" className="btn" onClick={() => void save()} disabled={busy}>Guardar</button>
        {message ? <p className="notice" role="status">{message}</p> : null}
      </section>
    </div>
  );
}
