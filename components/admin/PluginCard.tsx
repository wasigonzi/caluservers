"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConfigField, PluginPublicView, SecretField } from "@/lib/plugins";

/**
 * Tarjeta de un plugin: activar/desactivar, configuración generada desde
 * el `configSchema` del manifiesto y formulario de secretos.
 *
 * Los secretos nunca se pre-rellenan: los campos empiezan vacíos y un
 * campo vacío conserva el valor guardado.
 */
export default function PluginCard({ initial }: { initial: PluginPublicView }) {
  const [plugin, setPlugin] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const manifest = plugin.manifest;

  const [configValues, setConfigValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(plugin.config).map(([key, value]) => [key, String(value ?? "")]),
    ),
  );
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  async function callApi(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/plugins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: plugin.key, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data?.error || "No se pudo guardar." });
        return null;
      }
      if (data.plugin) {
        setPlugin(data.plugin);
        setConfigValues(
          Object.fromEntries(
            Object.entries(data.plugin.config ?? {}).map(([key, value]) => [
              key,
              String(value ?? ""),
            ]),
          ),
        );
      }
      return data;
    } catch {
      setMessage({ ok: false, text: "No hubo conexión con el servidor." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const data = await callApi({ action: "toggle", enabled: !plugin.enabled });
    if (data) {
      setMessage({
        ok: true,
        text: plugin.enabled ? "Plugin desactivado." : "Plugin activado.",
      });
    }
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    const config: Record<string, unknown> = {};
    for (const field of manifest?.configSchema ?? []) {
      const raw = configValues[field.name];
      if (field.type === "checkbox") {
        config[field.name] = raw === "true" || raw === "on";
      } else if (field.type === "number") {
        config[field.name] = raw === "" || raw === undefined ? "" : Number(raw);
      } else {
        config[field.name] = raw ?? "";
      }
    }
    const data = await callApi({ action: "save-config", config });
    if (data) setMessage({ ok: true, text: "Configuración guardada." });
  }

  async function saveSecrets(event: React.FormEvent) {
    event.preventDefault();
    const secrets: Record<string, string> = {};
    for (const field of manifest?.secretFields ?? []) {
      const value = (secretValues[field.name] ?? "").trim();
      if (value) secrets[field.name] = value;
    }
    if (Object.keys(secrets).length === 0) {
      setMessage({ ok: false, text: "Escribe al menos un secreto para guardar." });
      return;
    }
    const data = await callApi({ action: "save-secrets", secrets });
    if (data) {
      setSecretValues({});
      setMessage({
        ok: true,
        text: "Secretos guardados cifrados. No se vuelven a mostrar.",
      });
    }
  }

  const needsSecrets =
    plugin.kind === "payment" &&
    plugin.key !== "bank_transfer" &&
    (manifest?.secretFields.length ?? 0) > 0;
  const missingSecrets = needsSecrets && !plugin.hasSecrets;

  return (
    <article className="panel" aria-labelledby={`plugin-${plugin.key}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h3 id={`plugin-${plugin.key}`} style={{ margin: 0 }}>
            {plugin.label}
          </h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {manifest?.description ?? "Plugin sin manifiesto conocido."}
          </p>
        </div>
        <button
          className={plugin.enabled ? "btn secondary small" : "btn small"}
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={plugin.enabled}
        >
          {plugin.enabled ? "Desactivar" : "Activar"}
        </button>
      </div>

      <p className="muted" style={{ margin: "10px 0 0" }}>
        Estado: <strong>{plugin.enabled ? "Activo" : "Inactivo"}</strong>
        {" · "}Secretos:{" "}
        <strong>
          {plugin.hasSecrets
            ? `Guardados${plugin.lastRotatedAt ? ` (última rotación ${new Date(plugin.lastRotatedAt).toLocaleDateString("es-PR")})` : ""}`
            : "Sin guardar"}
        </strong>
        {" · "}Capacidades:{" "}
        {manifest?.capabilities.length ? manifest.capabilities.join(", ") : "—"}
      </p>

      {missingSecrets ? (
        <p className="error" role="alert" style={{ marginTop: 10 }}>
          Sin credenciales: este plugin no puede cobrar hasta que guardes sus
          secretos abajo. Activarlo sin credenciales no cobra nada.
        </p>
      ) : null}

      {plugin.key === "bank_transfer" ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Las instrucciones que ve el cliente se editan en{" "}
          <Link href="/admin/configuracion">Configuración general</Link> →
          «Instrucciones de pago manual».
        </p>
      ) : null}
      {plugin.key === "whm" ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Las credenciales de WHM se gestionan en{" "}
          <Link href="/admin/settings">Conexión WHM</Link>; aquí solo se
          activa o desactiva el panel.
        </p>
      ) : null}

      {manifest && manifest.configSchema.length > 0 ? (
        <form onSubmit={(event) => void saveConfig(event)} style={{ marginTop: 12 }}>
          <h4 style={{ margin: "0 0 4px" }}>Configuración</h4>
          {manifest.configSchema.map((field: ConfigField) => (
            <label className="field" key={field.name}>
              {field.label}
              {field.required ? " *" : ""}
              {field.type === "select" ? (
                <select
                  value={configValues[field.name] ?? ""}
                  onChange={(event) =>
                    setConfigValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  required={field.required}
                >
                  <option value="">Elige…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={configValues[field.name] ?? ""}
                  onChange={(event) =>
                    setConfigValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  placeholder={field.placeholder}
                  rows={3}
                />
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={configValues[field.name] === "true" || configValues[field.name] === "on"}
                  onChange={(event) =>
                    setConfigValues((prev) => ({
                      ...prev,
                      [field.name]: event.target.checked ? "true" : "false",
                    }))
                  }
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
                  value={configValues[field.name] ?? ""}
                  onChange={(event) =>
                    setConfigValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  autoComplete="off"
                />
              )}
              {field.help ? <span className="muted">{field.help}</span> : null}
            </label>
          ))}
          <div className="row-actions">
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </form>
      ) : null}

      {manifest && manifest.secretFields.length > 0 ? (
        <form onSubmit={(event) => void saveSecrets(event)} style={{ marginTop: 12 }}>
          <h4 style={{ margin: "0 0 4px" }}>Secretos</h4>
          <p className="muted" style={{ margin: "0 0 4px" }}>
            Se guardan cifrados y nunca se muestran. Deja un campo en blanco
            para conservar su valor actual.
          </p>
          {manifest.secretFields.map((field: SecretField) => (
            <label className="field" key={field.name}>
              {field.label}
              {field.required && !plugin.hasSecrets ? " *" : ""}
              <input
                type="password"
                value={secretValues[field.name] ?? ""}
                onChange={(event) =>
                  setSecretValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                }
                placeholder={plugin.hasSecrets ? "Guardado — en blanco para conservar" : field.placeholder}
                autoComplete="new-password"
              />
            </label>
          ))}
          <div className="row-actions">
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar secretos"}
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p className={message.ok ? "muted" : "error"} role="status" style={{ marginTop: 10 }}>
          {message.text}
        </p>
      ) : null}
    </article>
  );
}
