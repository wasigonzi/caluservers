"use client";

import { useState } from "react";

export type CannedReplyRow = {
  id: string;
  title: string;
  body: string;
  locale: string;
  category: string;
  order: number;
  active: boolean;
  updatedAt: string;
};

/**
 * CRUD de respuestas predefinidas (Fase 5, frente C). Todo pasa por
 * /api/admin/canned-replies, que exige `tickets:reply`. Las respuestas se
 * insertan en el formulario de respuesta del ticket desde un desplegable.
 * Los textos sembrados son genéricos: el dueño debe revisarlos.
 */
export default function CannedRepliesManager({ initial }: { initial: CannedReplyRow[] }) {
  const [replies, setReplies] = useState<CannedReplyRow[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [order, setOrder] = useState(0);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function show(text: string, isError: boolean) {
    setMessage(text);
    setFailed(isError);
  }

  function startNew() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setCategory("general");
    setOrder(0);
    setActive(true);
  }

  function startEdit(row: CannedReplyRow) {
    setEditingId(row.id);
    setTitle(row.title);
    setBody(row.body);
    setCategory(row.category);
    setOrder(row.order);
    setActive(row.active);
    show("", false);
  }

  const sorted = (list: CannedReplyRow[]) =>
    [...list].sort((a, b) => (a.order === b.order ? a.title.localeCompare(b.title) : a.order - b.order));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    show("", false);
    try {
      const url = editingId ? `/api/admin/canned-replies/${editingId}` : "/api/admin/canned-replies";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category, order, active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la respuesta.");
      const saved = data.reply as CannedReplyRow;
      setReplies((list) =>
        sorted(editingId ? list.map((row) => (row.id === editingId ? saved : row)) : [...list, saved]),
      );
      show(editingId ? "Respuesta guardada." : "Respuesta creada.", false);
      startNew();
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo guardar la respuesta.", true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: CannedReplyRow) {
    if (!window.confirm(`¿Borrar la respuesta predefinida «${row.title}»?`)) return;
    setBusy(true);
    show("", false);
    try {
      const res = await fetch(`/api/admin/canned-replies/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo borrar la respuesta.");
      setReplies((list) => list.filter((item) => item.id !== row.id));
      if (editingId === row.id) startNew();
      show("Respuesta borrada.", false);
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo borrar la respuesta.", true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: CannedReplyRow) {
    setBusy(true);
    show("", false);
    try {
      const res = await fetch(`/api/admin/canned-replies/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el estado.");
      setReplies((list) =>
        list.map((item) => (item.id === row.id ? { ...item, active: !row.active } : item)),
      );
      show(row.active ? "Respuesta desactivada: ya no sale en el desplegable." : "Respuesta activada.", false);
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo cambiar el estado.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {message ? (
        <p className={failed ? "error" : "success"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      <section className="panel-block">
        <h2>{editingId ? "Editar respuesta" : "Nueva respuesta"}</h2>
        <form onSubmit={save} className="stack">
          <label>
            Título
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </label>
          <label>
            Texto
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={5} maxLength={4000} />
          </label>
          <label>
            Categoría
            <input value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={60} />
          </label>
          <label>
            Orden en el desplegable
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(Number(e.target.value) || 0)}
              step={10}
            />
          </label>
          <label className="checkline">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
          </label>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear respuesta"}
            </button>
            {editingId ? (
              <button className="btn secondary" type="button" onClick={startNew} disabled={busy}>
                Cancelar edición
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel-block">
        <h2>Respuestas ({replies.length})</h2>
        {replies.length === 0 ? (
          <p className="muted">No hay respuestas predefinidas. Crea una para insertarla al responder un ticket.</p>
        ) : (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Orden</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {replies.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.category}</td>
                    <td>{row.order}</td>
                    <td>{row.active ? "Activa" : "Inactiva"}</td>
                    <td>
                      <button className="btn secondary small" type="button" onClick={() => startEdit(row)} disabled={busy}>
                        Editar
                      </button>{" "}
                      <button className="btn secondary small" type="button" onClick={() => toggleActive(row)} disabled={busy}>
                        {row.active ? "Desactivar" : "Activar"}
                      </button>{" "}
                      <button className="btn secondary small" type="button" onClick={() => remove(row)} disabled={busy}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
