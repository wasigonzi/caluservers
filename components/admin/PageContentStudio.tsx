"use client";

import { useEffect, useMemo, useState } from "react";
import type { PageFieldDef } from "@/lib/page-content";

type CatalogItem = {
  path: string;
  label: string;
  description: string;
  sections: string[];
  fields: PageFieldDef[];
};

type DbStatus = {
  ok: boolean;
  missingMigration: boolean;
  message: string;
};

export default function PageContentStudio({
  initialCatalog,
  initialPages,
  initialDb,
}: {
  initialCatalog: CatalogItem[];
  initialPages: Record<string, Record<string, string>>;
  initialDb: DbStatus;
}) {
  const [path, setPath] = useState(initialCatalog[0]?.path || "/");
  const [pages, setPages] = useState(initialPages);
  const [saved, setSaved] = useState(initialPages);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [db, setDb] = useState(initialDb);

  const current = initialCatalog.find((c) => c.path === path);
  const payload = pages[path] || {};
  const dirty = JSON.stringify(payload) !== JSON.stringify(saved[path] || {});

  const fields = useMemo(() => {
    if (!current) return [] as PageFieldDef[];
    const q = query.trim().toLowerCase();
    if (!q) return current.fields;
    return current.fields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.section.toLowerCase().includes(q),
    );
  }, [current, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PageFieldDef[]>();
    for (const f of fields) {
      const list = map.get(f.section) || [];
      list.push(f);
      map.set(f.section, list);
    }
    return [...map.entries()];
  }, [fields]);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  function setField(id: string, value: string) {
    setPages((prev) => ({
      ...prev,
      [path]: { ...(prev[path] || {}), [id]: value },
    }));
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/admin/page-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, payload: pages[path] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Error al guardar");
        if (data.missingMigration) {
          setDb({
            ok: false,
            missingMigration: true,
            message: data.error || "Falta migración",
          });
        }
        return;
      }
      setPages((p) => ({ ...p, [path]: data.payload }));
      setSaved((p) => ({ ...p, [path]: data.payload }));
      setStatus("saved");
      setMessage("Guardado en base de datos");
      setDb({ ok: true, missingMigration: false, message: "PageContent listo" });
    } catch {
      setStatus("error");
      setMessage("Error de red");
    }
  }

  async function restore() {
    if (!confirm("¿Restaurar textos por defecto de esta página?")) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/page-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, action: "restore" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "No se pudo restaurar");
        return;
      }
      setPages((p) => ({ ...p, [path]: data.payload }));
      setSaved((p) => ({ ...p, [path]: data.payload }));
      setStatus("saved");
      setMessage("Restaurado a defaults");
    } catch {
      setStatus("error");
      setMessage("Error de red");
    }
  }

  return (
    <div className="page-studio">
      <div className="pro-toolbar">
        <div className="pro-search">
          <input
            aria-label="Buscar campos"
            placeholder="Buscar campo o sección…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="pro-actions">
          {dirty ? <span className="pill warn">Cambios sin guardar</span> : null}
          <span className={`pill ${db.ok ? "ok" : "warn"}`}>
            {db.ok ? "DB lista" : "DB / migración pendiente"}
          </span>
        </div>
      </div>

      {!db.ok ? (
        <p className="error" role="status">
          {db.message} No se afirmará guardado hasta que la migración{" "}
          <code>PageContent</code> esté aplicada y la conexión responda.
        </p>
      ) : null}

      <div className="page-studio-grid">
        <aside className="page-studio-nav glass">
          <p className="muted">Páginas</p>
          {initialCatalog.map((p) => (
            <button
              type="button"
              key={p.path}
              className={path === p.path ? "admin-nav-link active" : "admin-nav-link"}
              onClick={() => setPath(p.path)}
            >
              {p.label}
              <span className="muted"> {p.path}</span>
            </button>
          ))}
        </aside>

        <div className="page-studio-editor">
          {current ? (
            <>
              <h2>{current.label}</h2>
              <p className="muted">{current.description}</p>
              {grouped.map(([section, list]) => (
                <section className="glass admin-card" key={section}>
                  <h3>{section}</h3>
                  {list.map((field) => (
                    <label className="field" key={field.id}>
                      {field.label}
                      <span className="muted"> · {field.id}</span>
                      {field.type === "textarea" ? (
                        <textarea
                          rows={3}
                          value={payload[field.id] || ""}
                          maxLength={field.max}
                          onChange={(e) => setField(field.id, e.target.value)}
                        />
                      ) : (
                        <input
                          value={payload[field.id] || ""}
                          maxLength={field.max}
                          onChange={(e) => setField(field.id, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </section>
              ))}

              <div className="preview-frame glass">
                <p className="muted">Vista previa (textos)</p>
                <p className="eyebrow">{payload.kicker || payload.faqKicker || ""}</p>
                <h3>
                  {payload.title || payload.stepsTitle || payload.faqTitle || current.label}
                  {payload.titleAccent ? (
                    <>
                      {" "}
                      <span className="accent">{payload.titleAccent}</span>
                    </>
                  ) : null}
                </h3>
                <p>{payload.lead || payload.stepsLead || ""}</p>
              </div>

              <div className="sticky-actions form-actions">
                <button className="btn" type="button" disabled={!dirty || status === "saving" || !db.ok} onClick={save}>
                  {status === "saving" ? "Guardando…" : "Guardar página"}
                </button>
                <button className="btn secondary" type="button" onClick={restore} disabled={!db.ok}>
                  Restaurar defaults
                </button>
                {message ? (
                  <span className={status === "error" ? "error" : "ok"}>{message}</span>
                ) : null}
              </div>
            </>
          ) : (
            <p>Selecciona una página</p>
          )}
        </div>
      </div>
    </div>
  );
}
