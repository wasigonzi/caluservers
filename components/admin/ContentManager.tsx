"use client";

import { useMemo, useState } from "react";

type Item = {
  id: string;
  kind: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
  fieldsJson: unknown;
  order: number;
  published: boolean;
};

type Section = {
  id: string;
  key: string;
  locale: string;
  title: string;
  subtitle: string | null;
  visible: boolean;
};

const KINDS: { value: string; label: string }[] = [
  { value: "testimonial", label: "Testimonios" },
  { value: "partner", label: "Socios" },
  { value: "project", label: "Proyectos" },
  { value: "faq", label: "FAQ" },
  { value: "page-section", label: "Sección de página" },
];

const SECTION_LABELS: Record<string, string> = {
  testimonials: "Testimonios",
  partners: "Socios",
  projects: "Proyectos",
  faq: "FAQ",
};

function fieldsOf(item: Item): Record<string, string> {
  const raw = item.fieldsJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export default function ContentManager({
  initialItems,
  initialSections,
}: {
  initialItems: Item[];
  initialSections: Section[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [kind, setKind] = useState("testimonial");
  const [locale, setLocale] = useState("es");
  const [editing, setEditing] = useState<Item | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [form, setForm] = useState({ slug: "", title: "", body: "", author: "", role: "", url: "", order: "0", published: false });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => items.filter((i) => i.kind === kind && i.locale === locale),
    [items, kind, locale],
  );
  const missingEn = useMemo(() => {
    const slugs = [...new Set(items.map((i) => i.slug))];
    return slugs.filter((slug) => {
      const es = items.some((i) => i.slug === slug && i.locale === "es");
      const en = items.some((i) => i.slug === slug && i.locale === "en");
      return es && !en;
    });
  }, [items]);

  function startNew() {
    setEditing(null);
    setForm({ slug: "", title: "", body: "", author: "", role: "", url: "", order: "0", published: false });
  }
  function startEdit(item: Item) {
    const f = fieldsOf(item);
    setEditing(item);
    setForm({
      slug: item.slug,
      title: item.title,
      body: item.body,
      author: f.author ?? "",
      role: f.role ?? "",
      url: f.url ?? "",
      order: String(item.order),
      published: item.published,
    });
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const fieldsJson: Record<string, string> = {};
    if (form.author.trim()) fieldsJson.author = form.author.trim();
    if (form.role.trim()) fieldsJson.role = form.role.trim();
    if (form.url.trim()) fieldsJson.url = form.url.trim();
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "item",
          id: editing?.id,
          kind,
          slug: form.slug.trim(),
          locale,
          title: form.title,
          body: form.body,
          fieldsJson: Object.keys(fieldsJson).length ? fieldsJson : undefined,
          order: Number(form.order) || 0,
          published: form.published,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
      const saved = data.item as Item;
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== saved.id);
        return [...next, saved];
      });
      setMessage("Contenido guardado.");
      startNew();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`¿Eliminar «${item.title}» (${item.locale})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/content?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar.");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setMessage("Contenido eliminado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSection(section: Section, patch: Partial<Section>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "section", key: section.key, locale: section.locale, title: patch.title ?? section.title, subtitle: patch.subtitle ?? section.subtitle, visible: patch.visible ?? section.visible }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar la sección.");
      setSections((prev) => prev.map((s) => (s.id === section.id ? (data.section as Section) : s)));
      setMessage("Sección guardada.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar la sección.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-columns">
      <section className="panel" aria-labelledby="content-list">
        <h2 id="content-list">Contenido</h2>
        <div className="content-filters">
          <label className="field">
            Tipo
            <select value={kind} onChange={(e) => { setKind(e.target.value); startNew(); }}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Idioma
            <select value={locale} onChange={(e) => { setLocale(e.target.value); startNew(); }}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" className="btn secondary" onClick={startNew}>Nuevo</button>
        </div>
        {missingEn.length > 0 ? (
          <p className="notice" role="status">
            Sin traducción al inglés (se sirve en español): {missingEn.join(", ")}.
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <p className="muted">Sin contenido de este tipo en este idioma. Las secciones vacías no se muestran en el portal.</p>
        ) : (
          <ul className="plain-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <span className="muted"> · {item.slug} · {item.published ? "Publicado" : "Borrador"}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="btn secondary" onClick={() => setPreview(item)}>Vista previa</button>
                  <button type="button" className="btn secondary" onClick={() => startEdit(item)}>Editar</button>
                  <button type="button" className="btn secondary" onClick={() => void remove(item)} disabled={busy}>Eliminar</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {preview ? (
          <article className="panel content-preview" aria-label="Vista previa">
            <h3>{preview.title}</h3>
            <p className="muted">{preview.slug} · {preview.locale} · {preview.published ? "Publicado" : "Borrador"}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{preview.body}</p>
            {(() => {
              const f = fieldsOf(preview);
              return Object.keys(f).length ? (
                <dl className="service-facts">
                  {Object.entries(f).map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              ) : null;
            })()}
            <button type="button" className="btn secondary" onClick={() => setPreview(null)}>Cerrar vista previa</button>
          </article>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="content-form">
        <h2 id="content-form">{editing ? "Editar contenido" : "Nuevo contenido"}</h2>
        <label className="field">Slug
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mi-contenido" />
        </label>
        <label className="field">Título
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="field">Texto
          <textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </label>
        <label className="field">Autor / nombre (opcional)
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        </label>
        <label className="field">Cargo o empresa (opcional)
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </label>
        <label className="field">URL (opcional)
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
        </label>
        <label className="field">Orden
          <input inputMode="numeric" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publicado
        </label>
        <p className="form-hint">Solo lo publicado se muestra en el portal. Los ítems de ejemplo ([Ejemplo]) están desactivados: no los publiques sin reemplazarlos por contenido real.</p>
        <button type="button" className="btn" onClick={() => void save()} disabled={busy}>Guardar</button>
        {message ? <p className="notice" role="status">{message}</p> : null}
      </section>

      <section className="panel" aria-labelledby="content-sections">
        <h2 id="content-sections">Secciones del portal</h2>
        <p className="muted">Una sección solo se muestra si está visible y tiene al menos un ítem publicado de su tipo.</p>
        <ul className="plain-list">
          {sections.map((section) => (
            <li key={section.id}>
              <span>
                <strong>{SECTION_LABELS[section.key] ?? section.key}</strong>
                <span className="muted"> · {section.locale} · {section.title}</span>
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void saveSection(section, { visible: !section.visible })}
                >
                  {section.visible ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
