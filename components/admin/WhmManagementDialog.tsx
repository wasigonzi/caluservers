"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import type { WhmManagementAction } from "@/lib/whm-management-schema";
export const WHM_ACTION_LABELS: Record<WhmManagementAction, string> = {
  createacct: "Crear cuenta",
  suspendacct: "Suspender cuenta",
  unsuspendacct: "Reactivar cuenta",
  changepackage: "Cambiar paquete",
  addpkg: "Crear paquete",
  editpkg: "Editar paquete",
};
const ACL: Record<WhmManagementAction, string> = {
  createacct: "create-acct",
  suspendacct: "suspend-acct",
  unsuspendacct: "suspend-acct",
  changepackage: "upgrade-account",
  addpkg: "create-pkg",
  editpkg: "edit-pkg",
};
export default function WhmManagementDialog({
  action,
  row,
  packages,
  onClose,
  onSuccess,
}: {
  action: WhmManagementAction;
  row?: Record<string, string>;
  packages: Record<string, string>[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    sending = useRef(false),
    request = useRef<AbortController | null>(null),
    title = useId();
  const [username, setUsername] = useState(""),
    [domain, setDomain] = useState(""),
    [password, setPassword] = useState(""),
    [plan, setPlan] = useState(""),
    [name, setName] = useState(row?.name || "");
  const [quota, setQuota] = useState(row?.QUOTA || ""),
    [bandwidth, setBandwidth] = useState(row?.BWLIMIT || ""),
    [emails, setEmails] = useState(row?.MAXPOP || ""),
    [databases, setDatabases] = useState(row?.MAXSQL || "");
  const [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const packageAction = action === "addpkg" || action === "editpkg",
    target = packageAction
      ? name
      : action === "createacct"
        ? username
        : row?.user || "";
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      request.current?.abort();
      node?.close();
    };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      sending.current ||
      uncertain ||
      !target ||
      confirmation !== target ||
      !ack
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    const fields =
      action === "createacct"
        ? { username, domain, password, plan }
        : packageAction
          ? {
              name,
              quota,
              bwlimit: bandwidth,
              maxpop: emails,
              maxsql: databases,
            }
          : action === "suspendacct"
            ? { user: target, reason }
            : action === "changepackage"
              ? { user: target, pkg: plan }
              : { user: target };
    const controller = new AbortController();
    request.current = controller;
    try {
      const pending = fetch("/api/admin/whm/manage", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...fields,
          confirmation,
          notificationsAcknowledged: ack,
        }),
      });
      setPassword(""); // Never retain a submitted password, including after failure.
      const response = await pending,
        data = await response.json();
      if (!response.ok) {
        if (data.code === "uncertain") {
          setUncertain(true);
          setError(
            "Resultado desconocido: podría haberse aplicado. Cierra y comprueba los datos antes de repetir; no hay reintentos automáticos.",
          );
        } else if (data.code === "package_advanced")
          setError(
            "Paquete con opciones avanzadas no conservables de forma segura. No se enviaron cambios: edítalo desde WHM.",
          );
        else if (data.code === "conflict")
          setError(
            "El recurso o su estado cambió. Cierra para actualizar antes de repetir.",
          );
        else if (data.code === "rejected")
          setError(
            `WHM no confirmó la operación. Revisa permiso ${ACL[action]}, límites del reseller y validación del servidor; no se elevan permisos.`,
          );
        else if (response.status === 401)
          setError(
            "Tu sesión expiró. Inicia sesión de nuevo antes de gestionar.",
          );
        else
          setError(
            "No se confirmó la operación. Revisa los campos, cuotas y configuración. No se mostrará el error remoto ni se reintentará.",
          );
        return;
      }
      if (
        data.ok !== true ||
        data.action !== action ||
        data.target !== target ||
        typeof data.auditRecorded !== "boolean"
      )
        throw Error("unconfirmed");
      onSuccess(
        `${WHM_ACTION_LABELS[action]}: WHM confirmó la operación.${data.auditRecorded ? "" : " El registro final de auditoría quedó pendiente; no repitas la operación."}`,
      );
    } catch {
      if (!controller.signal.aborted) {
        setUncertain(true);
        setError(
          "No se pudo confirmar el resultado. Podría haberse aplicado: cierra y revisa los datos antes de volver a intentarlo.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setPassword("");
        setConfirmation("");
        setAck(false);
      }
      sending.current = false;
    }
  }
  const limitField = (
    label: string,
    value: string,
    set: (value: string) => void,
  ) => (
    <label className="field">
      {label}
      <input
        required
        value={value}
        maxLength={12}
        pattern="([1-9][0-9]*|unlimited)"
        placeholder="Número positivo o unlimited"
        onChange={(event) => set(event.target.value)}
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="whm-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="whm-dialog-heading">
        <div>
          <p className="accent">GESTIÓN WHM</p>
          <h2 id={title}>{WHM_ACTION_LABELS[action]}</h2>
        </div>
        <button
          type="button"
          className="btn secondary"
          aria-label="Cerrar gestión"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="muted">
        Acción real en tu servidor. WHM comprueba permisos {ACL[action]} y
        restricciones del usuario; que el botón sea visible no garantiza
        autorización.
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset className="studio-fields" disabled={busy || uncertain}>
          {action === "createacct" ? (
            <>
              <label className="field">
                Usuario cPanel
                <input
                  required
                  value={username}
                  pattern="[a-z][a-z0-9_]*"
                  maxLength={16}
                  autoComplete="off"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setConfirmation("");
                  }}
                />
                <small>
                  Minúsculas, máximo16; no comienza por test. WHM valida
                  unicidad.
                </small>
              </label>
              <label className="field">
                Dominio principal
                <input
                  required
                  value={domain}
                  maxLength={253}
                  placeholder="dominio-del-cliente.com"
                  autoComplete="off"
                  onChange={(e) => setDomain(e.target.value)}
                />
              </label>
              <label className="field">
                Contraseña inicial
                <input
                  type="password"
                  required
                  value={password}
                  minLength={16}
                  maxLength={128}
                  autoComplete="new-password"
                  spellCheck={false}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small>
                  16–128 caracteres, al menos3 tipos
                  (mayúsculas/minúsculas/números/símbolos), sin usuario. No se
                  muestra ni conserva tras enviar.
                </small>
              </label>
            </>
          ) : null}
          {packageAction ? (
            <>
              <label className="field">
                Nombre del paquete
                <input
                  required
                  value={name}
                  disabled={action === "editpkg"}
                  pattern={"[A-Za-z0-9][A-Za-z0-9_.\\-]*"}
                  maxLength={64}
                  onChange={(e) => {
                    setName(e.target.value);
                    setConfirmation("");
                  }}
                />
                <small>
                  No se puede renombrar. Usa letras, números, guion o guion
                  bajo.
                </small>
              </label>
              <div className="whm-quota-grid">
                {limitField("Disco (MB)", quota, setQuota)}
                {limitField("Transferencia (MB)", bandwidth, setBandwidth)}
                {limitField("Cuentas de correo", emails, setEmails)}
                {limitField("Bases de datos", databases, setDatabases)}
              </div>
              <p className="muted">
                Valores positivos o unlimited; cuotas sin límite necesitan el
                ACL correspondiente. No se modifican otras opciones de paquetes
                existentes; opciones desconocidas bloquean la edición.
              </p>
            </>
          ) : null}
          {action === "createacct" || action === "changepackage" ? (
            <label className="field">
              Paquete real disponible
              <select
                required
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                <option value="">Selecciona un paquete</option>
                {packages.map((pkg) => (
                  <option
                    key={pkg.name}
                    value={pkg.name}
                    disabled={
                      action === "changepackage" && pkg.name === row?.plan
                    }
                  >
                    {pkg.name}
                    {pkg.name === row?.plan ? " (actual)" : ""}
                  </option>
                ))}
              </select>
              {packages.length === 0 ? (
                <small>
                  No hay paquetes verificados; crea uno o revisa permisos antes
                  de continuar.
                </small>
              ) : null}
            </label>
          ) : null}
          {action === "suspendacct" ? (
            <label className="field">
              Motivo de suspensión
              <textarea
                required
                minLength={3}
                maxLength={160}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          ) : null}
          <div className="whm-confirmation">
            <ShieldAlert size={20} aria-hidden="true" />
            <p>
              {action === "editpkg"
                ? "Editar afecta a TODAS las cuentas que utilizan este paquete."
                : action === "suspendacct"
                  ? "La suspensión interrumpe el servicio de esta cuenta; no la elimina."
                  : action === "changepackage"
                    ? "El cambio modifica los recursos y las funciones del plan de la cuenta."
                    : "Confirma el recurso exacto antes de ejecutar."}{" "}
              {row?.user ? `Cuenta: ${row.user}.` : null}
            </p>
          </div>
          <label className="field">
            Escribe {target || "el nombre del recurso"} para confirmar
            <input
              required
              value={confirmation}
              autoComplete="off"
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <label className="whm-ack">
            <input
              type="checkbox"
              required
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              Autorizo esta operación. WHM puede enviar sus notificaciones según
              Contact Manager; la web no envía correos adicionales. No se
              reintenta automáticamente.
            </span>
          </label>
        </fieldset>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p role="status">
            WHM está procesando. No cierres ni vuelvas a enviar la operación.
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            {uncertain ? "Cerrar y comprobar estado" : "Cancelar"}
          </button>
          <button
            type="submit"
            className="btn"
            disabled={
              busy || uncertain || !target || confirmation !== target || !ack
            }
          >
            {busy ? "Procesando…" : "Confirmar operación real"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
