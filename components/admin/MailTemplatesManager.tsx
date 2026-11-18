"use client";

import { useState } from "react";
import { MAIL_TEMPLATE_KEYS, TEMPLATE_VARIABLES, type MailTemplateKey } from "@/lib/mail-template-vars";

export type MailTemplateRow = {
  id: string;
  key: string;
  locale: string;
  subject: string;
  body: string;
  variablesJson: unknown;
  variables: { name: string; label: string }[];
  active: boolean;
  updatedAt: string;
};

function variableNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * CRUD de plantillas de correo (Fase 5, frente C). Todo pasa por
 * /api/admin/mail-templates, que exige `mail:write`. Sin SMTP las
 * plantillas se guardan igual, solo no se envían. Borrar una plantilla no
 * rompe el envío: el mailer cae al texto del código.
 */
export default function MailTemplatesManager({ initial }: { initial: MailTemplateRow[] }) {
  const [templates, setTemplates] = useState<MailTemplateRow[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [key, setKey] = useState<MailTemplateKey>("password-reset");
  const [locale, setLocale] = useState("es");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState("");
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
    setKey("password-reset");
    setLocale("es");
    setSubject("");
    setBody("");
    setVariables("");
    setActive(true);
  }

  function startEdit(row: MailTemplateRow) {
    setEditingId(row.id);
    setKey(row.key as MailTemplateKey);
    setLocale(row.locale);
    setSubject(row.subject);
    setBody(row.body);
    setVariables(variableNames(row.variablesJson).join(", "));
    setActive(row.active);
    show("", false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    show("", false);
    const variablesJson = variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    try {
      const url = editingId ? `/api/admin/mail-templates/${editingId}` : "/api/admin/mail-templates";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? {} : { key, locale }),
          subject,
          body,
          variablesJson,
          active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la plantilla.");
      const saved = data.template as MailTemplateRow;
      setTemplates((list) =>
        (editingId
          ? list.map((row) => (row.id === editingId ? { ...saved, variables: row.variables } : row))
          : [...list, { ...saved, variables: TEMPLATE_VARIABLES[key] ?? [] }]
        ).sort((a, b) => (a.key === b.key ? a.locale.localeCompare(b.locale) : a.key.localeCompare(b.key))),
      );
      show(editingId ? "Plantilla guardada." : "Plantilla creada.", false);
      startNew();
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo guardar la plantilla.", true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: MailTemplateRow) {
    if (!window.confirm(`¿Borrar la plantilla ${row.key} (${row.locale})? El envío seguirá con el texto del código.`)) {
      return;
    }
    setBusy(true);
    show("", false);
    try {
      const res = await fetch(`/api/admin/mail-templates/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo borrar la plantilla.");
      setTemplates((list) => list.filter((item) => item.id !== row.id));
      if (editingId === row.id) startNew();
      show("Plantilla borrada. El envío usará el texto del código.", false);
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo borrar la plantilla.", true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: MailTemplateRow) {
    setBusy(true);
    show("", false);
    try {
      const res = await fetch(`/api/admin/mail-templates/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el estado.");
      setTemplates((list) =>
        list.map((item) => (item.id === row.id ? { ...item, active: !row.active } : item)),
      );
      show(row.active ? "Plantilla desactivada: el envío usará el texto del código." : "Plantilla activada.", false);
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
        <h2>{editingId ? "Editar plantilla" : "Nueva plantilla"}</h2>
        <form onSubmit={save} className="stack">
          <label>
            Envío
            <select value={key} onChange={(e) => setKey(e.target.value as MailTemplateKey)} disabled={Boolean(editingId)}>
              {MAIL_TEMPLATE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Idioma
            <select value={locale} onChange={(e) => setLocale(e.target.value)} disabled={Boolean(editingId)}>
              <option value="es">Español (es)</option>
              <option value="en">English (en)</option>
            </select>
          </label>
          <label>
            Asunto
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
          </label>
          <label>
            Cuerpo
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={6} />
          </label>
          <label>
            Variables (separadas por coma)
            <input
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              placeholder="resetUrl"
              aria-describedby="variables-help"
            />
          </label>
          <p className="muted" id="variables-help">
            Variables disponibles para {key}:{" "}
            {(TEMPLATE_VARIABLES[key] ?? []).map((v) => `{{${v.name}}}`).join(", ") || "ninguna"}.
            Una variable sin valor se deja vacía, nunca se muestra como {"{{variable}}"}.
          </p>
          <label className="checkline">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
          </label>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear plantilla"}
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
        <h2>Plantillas ({templates.length})</h2>
        {templates.length === 0 ? (
          <p className="muted">
            No hay plantillas: todos los envíos usan el texto del código. Crea una para personalizarlos.
          </p>
        ) : (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">Envío</th>
                  <th scope="col">Idioma</th>
                  <th scope="col">Asunto</th>
                  <th scope="col">Variables</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((row) => (
                  <tr key={row.id}>
                    <td>{row.key}</td>
                    <td>{row.locale}</td>
                    <td>{row.subject}</td>
                    <td>{variableNames(row.variablesJson).map((v) => `{{${v}}}`).join(", ") || "—"}</td>
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
