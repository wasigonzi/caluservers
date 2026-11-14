"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProvisionPublicConfig } from "@/lib/whm-provision";

type Plan = { id: string; name: string };

/**
 * Alta automática en WHM. El token se escribe, nunca se lee de vuelta.
 * Guardar no prueba la conexión: el alta real ocurre al cobrar un pedido.
 */
export default function ProvisionForm({
  initial,
  plans,
  storageError,
}: {
  initial: ProvisionPublicConfig;
  plans: Plan[];
  storageError: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial.url);
  const [username, setUsername] = useState(initial.username);
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [packageName, setPackageName] = useState(initial.packageName);
  const [packages, setPackages] = useState<Record<string, string>>(initial.packageByPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(storageError);
  const [saved, setSaved] = useState("");

  const checks = [
    {
      label: "Alta activada",
      ok: initial.enabled,
      hint: "Activa la casilla de abajo.",
    },
    {
      label: "Servidor WHM",
      ok: Boolean(initial.url),
      hint: "Falta la URL del servidor (https, puerto 2087).",
    },
    {
      label: "Token WHM guardado",
      ok: initial.hasToken,
      hint: "Falta el token con permiso createacct.",
    },
    {
      label: "Paquete WHM asignado",
      ok: Boolean(initial.packageName) || Object.keys(initial.packageByPlan).length > 0,
      hint: "Falta el paquete por defecto o por plan.",
    },
    {
      label: "Correo saliente (SMTP)",
      ok: initial.mailReady,
      hint: "Sin SMTP_URL la contraseña no se envía por correo, pero el alta se hace igual y queda visible en el panel del cliente y en el de administración.",
    },
  ];
  const missing = checks
    .filter((check) => !check.ok && check.label !== "Correo saliente (SMTP)")
    .map((check) => check.label);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setSaved("");
        try {
          const response = await fetch("/api/admin/provision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              url,
              username,
              ...(token ? { token } : {}),
              enabled,
              packageName,
              packageByPlan: packages,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setError(data?.error || "No se pudo guardar.");
            return;
          }
          setToken("");
          setSaved(
            data?.ready
              ? "Guardado. El alta automática está lista para el próximo pago."
              : "Guardado. Todavía falta algo para que el alta funcione (mira el estado).",
          );
          router.refresh();
        } catch {
          setError("No hubo conexión al guardar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        {initial.ready
          ? "El alta automática está lista para el próximo pago."
          : missing.length
            ? `Falta para que el alta funcione: ${missing.join(", ")}.`
            : "El alta automática está desactivada."}
      </p>
      <ul className="checklist" aria-label="Estado de la configuración del alta automática">
        {checks.map((check) => (
          <li key={check.label}>
            <span aria-hidden="true">{check.ok ? "✓" : "✗"}</span>{" "}
            <strong>{check.label}</strong>
            {check.ok ? (
              <>
                {check.label === "Servidor WHM" && initial.url ? (
                  <span className="muted"> · {initial.url}</span>
                ) : null}
                {check.label === "Paquete WHM asignado" && initial.packageName ? (
                  <span className="muted"> · {initial.packageName}</span>
                ) : null}
              </>
            ) : (
              <span className="muted"> — {check.hint}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="notice">
        El correo saliente no bloquea el alta: sin SMTP la contraseña inicial no se
        envía, pero queda visible en el panel del cliente y en el de administración.
      </p>

      <label className="field">
        Servidor WHM (https, puerto 2087)
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://servidor.ejemplo.com:2087"
          maxLength={300}
          required
        />
      </label>
      <label className="field">
        Usuario WHM
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={32}
          required
        />
      </label>
      <label className="field">
        Token WHM con permiso <code>createacct</code>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={initial.hasToken ? "Guardado. Escribe uno nuevo para cambiarlo." : ""}
          autoComplete="off"
          maxLength={512}
        />
        <span className="muted">
          Token distinto del de solo lectura. Limita su ACL a crear cuentas; no uses
          «Everything».
        </span>
      </label>

      <label className="field">
        Paquete WHM por defecto
        <input
          value={packageName}
          onChange={(event) => setPackageName(event.target.value)}
          placeholder="default"
          maxLength={64}
        />
      </label>

      {plans.length ? (
        <fieldset>
          <legend>Paquete por plan de hosting</legend>
          {plans.map((plan) => (
            <label className="field" key={plan.id}>
              {plan.name}
              <input
                value={packages[plan.id] ?? ""}
                onChange={(event) =>
                  setPackages((previous) => ({ ...previous, [plan.id]: event.target.value }))
                }
                placeholder="usa el paquete por defecto"
                maxLength={64}
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />{" "}
        Crear la cuenta cPanel automáticamente al confirmarse un pago
      </label>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="notice" role="status">
          {saved}
        </p>
      ) : null}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
