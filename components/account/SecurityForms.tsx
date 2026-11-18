"use client";

import { useEffect, useState } from "react";
import { customerAuthClient } from "@/lib/customer-auth-client";

type ClientPasskey = {
  id: string;
  name?: string | null;
  createdAt: string | Date;
  aaguid?: string | null;
};

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-PR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function AccountSecurityForms() {
  const { data: session, isPending: sessionPending } = customerAuthClient.useSession();
  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  const [passkeys, setPasskeys] = useState<ClientPasskey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [passkeyName, setPasskeyName] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // TOTP: activar exige contraseña + verificar el código (el plugin no
  // activa nada hasta verifyTotp). Los códigos de respaldo salen al activar.
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [totpCode, setTotpCode] = useState("");

  async function refreshPasskeys() {
    setPasskeysLoading(true);
    try {
      const result = await customerAuthClient.passkey.listUserPasskeys();
      setPasskeys((result.data ?? []) as ClientPasskey[]);
    } catch {
      setPasskeys([]);
    } finally {
      setPasskeysLoading(false);
    }
  }

  useEffect(() => {
    refreshPasskeys();
    // Solo al montar: el listado se refresca tras cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addPasskey() {
    if (busy) return;
    setBusy("add-passkey");
    setMessage(null);
    try {
      const result = await customerAuthClient.passkey.addPasskey({
        name: passkeyName.trim() || undefined,
      });
      if (result.error) {
        setMessage({ ok: false, text: result.error.message || "No se pudo registrar la passkey." });
      } else {
        setPasskeyName("");
        await refreshPasskeys();
        setMessage({ ok: true, text: "Passkey registrada. Ya puedes entrar con ella." });
      }
    } catch {
      setMessage({ ok: false, text: "El navegador canceló el registro o no soporta passkeys." });
    } finally {
      setBusy("");
    }
  }

  async function deletePasskey(id: string) {
    if (busy) return;
    setBusy(`delete-${id}`);
    setMessage(null);
    const result = await customerAuthClient.passkey.deletePasskey({ id });
    if (result.error) {
      setMessage({ ok: false, text: result.error.message || "No se pudo eliminar la passkey." });
    } else {
      setPasskeys((list) => list.filter((item) => item.id !== id));
      setMessage({ ok: true, text: "Passkey eliminada." });
    }
    setBusy("");
  }

  async function enableTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("enable-2fa");
    setMessage(null);
    const result = await customerAuthClient.twoFactor.enable({ password });
    if (result.error) {
      setMessage({ ok: false, text: result.error.message || "No se pudo activar el segundo factor." });
      setBusy("");
      return;
    }
    // El plugin devuelve la URI TOTP y los códigos de respaldo; nada queda
    // activo hasta verificar el código. El método es totp por defecto.
    const data = result.data;
    if (data?.method === "totp") {
      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes);
    }
    setTotpCode("");
    setBusy("");
  }

  async function verifyTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("verify-2fa");
    setMessage(null);
    const result = await customerAuthClient.twoFactor.verifyTotp({ code: totpCode });
    if (result.error) {
      setMessage({ ok: false, text: result.error.message || "El código no es válido." });
    } else {
      setTotpUri("");
      setTotpCode("");
      setPassword("");
      setMessage({
        ok: true,
        text: "Verificación en dos pasos activada. Guarda los códigos de respaldo: no se vuelven a mostrar.",
      });
    }
    setBusy("");
  }

  async function disableTwoFactor() {
    if (busy) return;
    setBusy("disable-2fa");
    setMessage(null);
    const result = await customerAuthClient.twoFactor.disable({ password });
    if (result.error) {
      setMessage({ ok: false, text: result.error.message || "No se pudo desactivar." });
    } else {
      setPassword("");
      setBackupCodes(null);
      setTotpUri("");
      setMessage({ ok: true, text: "Verificación en dos pasos desactivada." });
    }
    setBusy("");
  }

  async function regenerateBackupCodes() {
    if (busy) return;
    setBusy("backup-codes");
    setMessage(null);
    const result = await customerAuthClient.twoFactor.generateBackupCodes({ password });
    if (result.error) {
      setMessage({ ok: false, text: result.error.message || "No se pudieron generar los códigos." });
    } else {
      setBackupCodes(result.data?.backupCodes ?? null);
      setMessage({
        ok: true,
        text: "Códigos nuevos generados. Los anteriores quedan invalidados: guárdalos ahora.",
      });
    }
    setBusy("");
  }

  return (
    <div className="dash-columns">
      <section className="panel" aria-labelledby="cli-passkeys">
        <h2 id="cli-passkeys">Mis passkeys</h2>
        <p className="muted">
          Entrada sin contraseña con huella, cara o llave de seguridad, ligada a este dominio.
        </p>
        {passkeysLoading ? (
          <p className="muted">Cargando passkeys…</p>
        ) : passkeys.length === 0 ? (
          <p className="muted">Sin passkeys todavía.</p>
        ) : (
          <ul className="config-rows">
            {passkeys.map((item) => (
              <li key={item.id} className="check-ok">
                <div className="config-main">
                  <p className="check-label">{item.name || "Passkey"}</p>
                  <p className="muted">Creada: {fmtDate(item.createdAt)}</p>
                </div>
                <div className="config-where">
                  <button
                    className="btn secondary small"
                    type="button"
                    disabled={busy === `delete-${item.id}`}
                    onClick={() => deletePasskey(item.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row-actions">
          <label className="field">
            Nombre (opcional)
            <input
              type="text"
              value={passkeyName}
              onChange={(event) => setPasskeyName(event.target.value)}
              placeholder="Ej.: iPhone"
              maxLength={64}
            />
          </label>
          <button className="btn small" type="button" disabled={busy === "add-passkey"} onClick={addPasskey}>
            {busy === "add-passkey" ? "Esperando al autenticador…" : "Registrar passkey"}
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="cli-2fa">
        <h2 id="cli-2fa">Verificación en dos pasos (TOTP)</h2>
        <p className="muted">
          Opcional. Si la activas, cada inicio de sesión pedirá además un código de 6 dígitos de
          tu app autenticadora. Al activar se generan códigos de respaldo de un solo uso.
        </p>
        {sessionPending ? (
          <p className="muted">Cargando estado…</p>
        ) : twoFactorEnabled ? (
          <>
            <p className="ok" role="status">
              Activada para tu cuenta.
            </p>
            <label className="field">
              Contraseña actual (para desactivar o regenerar códigos)
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="row-actions">
              <button
                className="btn small"
                type="button"
                disabled={busy === "backup-codes" || !password}
                onClick={regenerateBackupCodes}
              >
                {busy === "backup-codes" ? "Generando…" : "Regenerar códigos de respaldo"}
              </button>
              <button
                className="btn secondary small"
                type="button"
                disabled={busy === "disable-2fa" || !password}
                onClick={disableTwoFactor}
              >
                {busy === "disable-2fa" ? "Desactivando…" : "Desactivar"}
              </button>
            </div>
          </>
        ) : totpUri ? (
          <form onSubmit={verifyTwoFactor}>
            <p className="muted">
              Añade este secreto a tu app autenticadora. Nada queda activo hasta que el código
              verifique.
            </p>
            <label className="field">
              Secreto (URI TOTP)
              <input type="text" value={totpUri} readOnly onFocus={(event) => event.target.select()} />
            </label>
            <label className="field">
              Código de 6 dígitos
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
              />
            </label>
            <div className="row-actions">
              <button className="btn small" type="submit" disabled={busy === "verify-2fa" || totpCode.length !== 6}>
                {busy === "verify-2fa" ? "Verificando…" : "Verificar y activar"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={enableTwoFactor}>
            <label className="field">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contraseña"
              />
            </label>
            <div className="row-actions">
              <button className="btn small" type="submit" disabled={busy === "enable-2fa" || !password}>
                {busy === "enable-2fa" ? "Generando…" : "Activar verificación en dos pasos"}
              </button>
            </div>
          </form>
        )}
        {backupCodes ? (
          <div>
            <p className="muted">Códigos de respaldo: guárdalos ahora, no se vuelven a mostrar.</p>
            <ul>
              {backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className={message.ok ? "ok" : "error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
