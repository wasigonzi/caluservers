"use client";
import { useState } from "react";
import { ShieldCheck, Server, KeyRound } from "lucide-react";
import type { WhmPublicConfig } from "@/lib/whm";

export default function SettingsForm({
  initial,
  storageError = "",
}: {
  initial: WhmPublicConfig;
  storageError?: string;
}) {
  const [config, setConfig] = useState(initial);
  const [url, setUrl] = useState(initial.url),
    [username, setUsername] = useState(initial.username),
    [token, setToken] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const dirty =
    url !== config.url || username !== config.username || Boolean(token);
  const reset = () => {
    setMessage("");
    setError("");
    setVerified(false);
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    reset();
    try {
      const r = await fetch("/api/admin/whm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, username, token }),
      });
      const data = await r.json();
      if (!r.ok)
        throw Error(data.error || "No se pudo guardar la configuración.");
      setConfig(data);
      setUrl(data.url);
      setUsername(data.username);
      setToken("");
      setMessage(
        data.configured
          ? "Configuración cifrada guardada. Prueba la conexión para verificarla."
          : "Configuración parcial guardada. Pendiente añadir el token y probar.",
      );
    } catch {
      setError(
        "No se pudo guardar. Revisa URL HTTPS:2087, usuario y token. Al cambiar servidor/usuario, introduce de nuevo el token. Si persiste, revisa el almacenamiento de la aplicación.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (dirty || !config.configured) return;
    setBusy(true);
    reset();
    try {
      const r = await fetch("/api/admin/whm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "test" }),
      });
      const data = await r.json();
      if (
        !r.ok ||
        data.connected !== true ||
        data.metadata?.listaccts !== 1 ||
        data.metadata?.listpkgs !== 1
      )
        throw Error(data.error || "WHM no confirmó ambas lecturas.");
      setVerified(true);
      setMessage(
        `Lecturas verificadas en esta sesión: ${data.accounts} cuentas y ${data.packages} paquetes accesibles.`,
      );
    } catch {
      setError(
        "Prueba no confirmada. Revisa token/permisos, DNS, firewall y certificado TLS del servidor. No se reintentó automáticamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="whm-settings">
      <div className="whm-state" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <strong>
          {storageError
            ? "Almacenamiento no disponible"
            : verified
              ? "Lectura verificada en esta sesión"
              : config.configured
                ? "Configuración guardada · sin verificar"
                : "Pendiente configuración"}
        </strong>
        <span>Sólo lectura</span>
      </div>
      {storageError ? (
        <p className="error" role="alert">
          {storageError}
        </p>
      ) : null}
      <form onSubmit={save}>
        <fieldset
          disabled={busy || Boolean(storageError)}
          className="studio-fields"
        >
          <label className="field">
            <Server size={16} aria-hidden="true" /> URL del servidor WHM
            <input
              type="url"
              required
              value={url}
              placeholder="https://servidor.tudominio.com:2087"
              autoComplete="off"
              onChange={(e) => {
                setUrl(e.target.value);
                reset();
              }}
            />
            <small>
              Servidor del cliente, no el portal de facturación. HTTPS y
              certificado válido; puerto 2087.
            </small>
          </label>
          <label className="field">
            Usuario WHM
            <input
              required
              value={username}
              maxLength={32}
              pattern="[a-zA-Z0-9_]+"
              placeholder="root o usuario reseller"
              autoComplete="off"
              onChange={(e) => {
                setUsername(e.target.value);
                reset();
              }}
            />
          </label>
          <label className="field">
            <KeyRound size={16} aria-hidden="true" /> API token WHM
            <input
              type="password"
              value={token}
              maxLength={512}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={
                config.hasToken
                  ? "Token guardado · vacío conserva el existente"
                  : "Pendiente introducir token"
              }
              onChange={(e) => {
                setToken(e.target.value);
                reset();
              }}
            />
            <small>
              El token guardado nunca se devuelve al navegador. Puedes guardar
              servidor/usuario ahora y añadir el token después.
            </small>
          </label>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={!dirty}>
              {busy ? "Procesando…" : "Guardar configuración cifrada"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={dirty || !config.configured}
              onClick={test}
            >
              Probar conexión (sólo lectura)
            </button>
          </div>
        </fieldset>
        {dirty ? (
          <p className="muted">
            Hay cambios sin guardar. Guarda antes de probar; el test usa
            exclusivamente la configuración guardada.
          </p>
        ) : null}
      </form>
      {message ? (
        <p role="status" className="ok">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <details className="whm-help">
        <summary>Preparación y permisos mínimos</summary>
        <ol>
          <li>
            Indica el hostname HTTPS del servidor WHM, usuario root o reseller y
            su API token. Sólo el token no basta.
          </li>
          <li>
            En WHM → Development → Manage API Tokens, crea un token restringido
            a <code>list-accts</code> y <code>list-pkgs</code>. No habilites
            Everything, crear cuentas, cambiar contraseñas, sesiones o gestionar
            tokens.
          </li>
          <li>
            Un reseller sólo verá lo que sus privilegios permiten. El servidor
            debe aceptar la conexión desde el despliegue y tener un certificado
            TLS válido; nunca se desactiva la validación.
          </li>
          <li>
            Guarda y pulsa Probar conexión. HTTP 200 no basta: ambas operaciones
            deben devolver <code>metadata.result=1</code>. No gestiona pedidos,
            cobros ni facturas.
          </li>
        </ol>
        <a
          href="https://docs.cpanel.net/whm/development/manage-api-tokens-in-whm/"
          target="_blank"
          rel="noreferrer"
        >
          Documentación oficial de tokens y ACL →
        </a>
      </details>
    </div>
  );
}
