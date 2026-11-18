"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  mfaRequired: boolean;
  roles: string[];
};

/**
 * Gestión de administradores (Fase 1, tramo D — RBAC). Lista, alta con
 * email + contraseña + rol, y deshabilitar/rehabilitar. Todo pasa por
 * /api/admin/users, que exige `users:manage`; la contraseña nunca se
 * muestra ni se devuelve.
 */
export default function AdminUsersManager({
  initialUsers,
  roles,
}: {
  initialUsers: AdminUserRow[];
  roles: string[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(roles.includes("soporte") ? "soporte" : roles[0] || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function show(text: string, isError: boolean) {
    setMessage(text);
    setFailed(isError);
  }

  async function callApi(action: string, payload: Record<string, string>) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(
        data.error === "step-up-required"
          ? data.message || "Confirma tu identidad para continuar."
          : data.error || "No se pudo completar la operación.",
      ) as Error & { code?: string };
      error.code = data.error;
      throw error;
    }
    return data.user as AdminUserRow;
  }

  // Step-up (Fase 6, frente C): crear un admin asigna un rol, así que la
  // ruta exige confirmación reciente. Si responde `step-up-required`, se
  // muestra este formulario y al verificar se reintenta el alta.
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [stepUpError, setStepUpError] = useState("");

  async function doCreate() {
    const user = await callApi("create", { email, password, role });
    setUsers((list) => [user, ...list]);
    setEmail("");
    setPassword("");
    setNeedsStepUp(false);
    show(`Administrador ${user.email} creado con el rol ${user.roles.join(", ")}.`, false);
    router.refresh();
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    show("", false);
    try {
      await doCreate();
    } catch (error) {
      if ((error as Error & { code?: string }).code === "step-up-required") {
        setNeedsStepUp(true);
        show("", false);
      } else {
        show(String(error instanceof Error ? error.message : error), true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmStepUp(event: React.FormEvent) {
    event.preventDefault();
    if (stepUpBusy) return;
    setStepUpBusy(true);
    setStepUpError("");
    try {
      const res = await fetch("/api/admin/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: stepUpPassword, code: stepUpCode || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.mfaRequired
            ? "Falta el código de verificación o no es válido."
            : data?.error || "No se pudo confirmar tu identidad.",
        );
      }
      setStepUpPassword("");
      setStepUpCode("");
      await doCreate();
    } catch (error) {
      setStepUpError(String(error instanceof Error ? error.message : error));
    } finally {
      setStepUpBusy(false);
    }
  }

  async function setDisabled(user: AdminUserRow, disable: boolean) {
    if (disable && !window.confirm(`¿Deshabilitar a ${user.email}? No podrá entrar y se cierran sus sesiones.`)) {
      return;
    }
    setBusy(true);
    show("", false);
    try {
      const updated = await callApi(disable ? "disable" : "enable", { userId: user.id });
      setUsers((list) => list.map((entry) => (entry.id === updated.id ? updated : entry)));
      show(
        disable
          ? `${updated.email} deshabilitado. Sus sesiones quedan revocadas.`
          : `${updated.email} rehabilitado.`,
        false,
      );
      router.refresh();
    } catch (error) {
      show(String(error instanceof Error ? error.message : error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {message ? (
        <p className={failed ? "error" : "success"} role="status">
          {message}
        </p>
      ) : null}
      <section className="panel-block">
        <h2>Crear administrador</h2>
        <p className="muted">
          La contraseña se guarda con Argon2id y nunca se muestra. El rol
          owner solo lo puede asignar un owner. El propietario inicial se crea
          con <code>scripts/admin-migrate.mjs</code>, no desde aquí. Crear un
          administrador exige confirmar tu identidad (step-up): si tu última
          confirmación caducó, se te pedirá la contraseña de nuevo.
        </p>
        <form onSubmit={createUser} className="stack">
          <label>
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Contraseña (mínimo 8 caracteres)
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button className="btn" type="submit" disabled={busy}>
              Crear administrador
            </button>
          </div>
        </form>
        {needsStepUp ? (
          <form onSubmit={confirmStepUp} className="stack">
            <p className="muted">
              Crear un administrador asigna un rol y exige confirmar tu identidad. Escribe tu
              contraseña de administrador (y el código de verificación si tienes MFA activado);
              al confirmar, el alta se reintenta sola.
            </p>
            <label>
              Tu contraseña de administrador
              <input
                type="password"
                required
                value={stepUpPassword}
                onChange={(e) => setStepUpPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              Código de verificación (solo si tienes MFA activado)
              <input
                type="text"
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </label>
            {stepUpError ? (
              <p className="error" role="alert">
                {stepUpError}
              </p>
            ) : null}
            <div>
              <button className="btn" type="submit" disabled={stepUpBusy}>
                {stepUpBusy ? "Confirmando…" : "Confirmar identidad y crear"}
              </button>{" "}
              <button
                className="btn secondary"
                type="button"
                disabled={stepUpBusy}
                onClick={() => setNeedsStepUp(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </section>
      <section className="panel-block">
        <h2>Administradores ({users.length})</h2>
        {users.length === 0 ? (
          <p className="muted">
            Aún no hay administradores en la base. Crea el propietario con{" "}
            <code>scripts/admin-migrate.mjs</code>.
          </p>
        ) : (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Último acceso</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.roles.join(", ") || "sin rol"}</td>
                    <td>{user.disabledAt ? "Deshabilitado" : "Activo"}</td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("es-PR")
                        : "—"}
                    </td>
                    <td>
                      {user.disabledAt ? (
                        <button
                          className="btn secondary small"
                          type="button"
                          disabled={busy}
                          onClick={() => void setDisabled(user, false)}
                        >
                          Rehabilitar
                        </button>
                      ) : (
                        <button
                          className="btn secondary small"
                          type="button"
                          disabled={busy}
                          onClick={() => void setDisabled(user, true)}
                        >
                          Deshabilitar
                        </button>
                      )}
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
