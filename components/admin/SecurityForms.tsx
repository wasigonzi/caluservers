"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export type PasskeyItem = {
  id: string;
  credentialId: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type SessionItem = {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  userAgent: string | null;
  current: boolean;
};

type TotpState = { enrolled: boolean; source: "account" | "env" | "none" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export default function SecurityForms({
  totp,
  passkeys: initialPasskeys,
  recoveryCodesRemaining: initialRecovery,
  sessions: initialSessions,
  mfaRequired,
  canEnrolTotp,
}: {
  totp: TotpState;
  passkeys: PasskeyItem[];
  recoveryCodesRemaining: number;
  sessions: SessionItem[];
  mfaRequired: boolean;
  canEnrolTotp: boolean;
}) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [sessions, setSessions] = useState(initialSessions);
  const [recoveryRemaining, setRecoveryRemaining] = useState(initialRecovery);
  const [totpState, setTotpState] = useState(totp);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // TOTP: paso 1 genera el secreto (sin guardar), paso 2 lo verifica y guarda.
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUrl, setTotpUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function registerPasskey() {
    if (busy) return;
    setBusy("passkey");
    setMessage(null);
    try {
      const options = await postJson("/api/admin/webauthn/register-options", {});
      if (!options.ok) {
        setMessage({ ok: false, text: options.data?.error || "No se pudieron generar las opciones." });
        return;
      }
      const response = await startRegistration({ optionsJSON: options.data });
      const verified = await postJson("/api/admin/webauthn/register-verify", response);
      if (!verified.ok) {
        setMessage({ ok: false, text: verified.data?.error || "No se pudo verificar la passkey." });
        return;
      }
      const factors = await fetch("/api/admin/mfa/factors").then((res) => res.json()).catch(() => null);
      if (factors?.passkeys) setPasskeys(factors.passkeys);
      setMessage({ ok: true, text: "Passkey registrada. Ya puedes entrar con ella sin contraseña." });
    } catch {
      setMessage({ ok: false, text: "El navegador canceló el registro o no soporta passkeys." });
    } finally {
      setBusy("");
    }
  }

  async function revokePasskey(credentialId: string) {
    if (busy) return;
    setBusy(`revoke-${credentialId}`);
    setMessage(null);
    const result = await postJson("/api/admin/mfa/passkey-revoke", { credentialId });
    if (!result.ok) {
      setMessage({ ok: false, text: result.data?.error || "No se pudo revocar la passkey." });
    } else {
      setPasskeys((list) => list.filter((item) => item.credentialId !== credentialId));
      setMessage({ ok: true, text: "Passkey revocada." });
    }
    setBusy("");
  }

  async function revokeSession(id: string) {
    if (busy) return;
    setBusy(`session-${id}`);
    setMessage(null);
    const result = await postJson("/api/admin/mfa/session-revoke", { id });
    if (!result.ok) {
      setMessage({ ok: false, text: result.data?.error || "No se pudo revocar la sesión." });
    } else {
      setSessions((list) => list.filter((item) => item.id !== id));
      setMessage({ ok: true, text: "Sesión revocada." });
    }
    setBusy("");
  }

  async function startTotpEnrol() {
    if (busy) return;
    setBusy("totp-start");
    setMessage(null);
    const result = await postJson("/api/admin/mfa/totp-enrol", {});
    if (!result.ok) {
      setMessage({ ok: false, text: result.data?.error || "No se pudo generar el secreto." });
    } else {
      setTotpSecret(result.data.secret);
      setTotpUrl(result.data.otpauthUrl);
      setTotpCode("");
    }
    setBusy("");
  }

  async function confirmTotpEnrol(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !totpSecret) return;
    setBusy("totp-confirm");
    setMessage(null);
    const result = await postJson("/api/admin/mfa/totp-enrol", { secret: totpSecret, code: totpCode });
    if (!result.ok) {
      setMessage({ ok: false, text: result.data?.error || "No se pudo guardar el TOTP." });
    } else {
      setTotpState({ enrolled: true, source: "account" });
      setTotpSecret("");
      setTotpUrl("");
      setTotpCode("");
      setMessage({ ok: true, text: "TOTP activado para tu cuenta. El login ya pedirá el código." });
    }
    setBusy("");
  }

  async function generateRecoveryCodes() {
    if (busy) return;
    setBusy("recovery");
    setMessage(null);
    const result = await postJson("/api/admin/mfa/recovery-codes", {});
    if (!result.ok) {
      setMessage({ ok: false, text: result.data?.error || "No se pudieron generar los códigos." });
    } else {
      setRecoveryCodes(result.data.codes);
      setRecoveryRemaining(result.data.count ?? 0);
      setMessage({
        ok: true,
        text: "Códigos nuevos generados. Los anteriores sin usar quedan invalidados: guarda estos ahora, no se vuelven a mostrar.",
      });
    }
    setBusy("");
  }

  return (
    <div className="config-grid">
      <section className="panel" aria-labelledby="sec-sessions">
        <h2 id="sec-sessions">Sesiones activas</h2>
        <p className="muted">
          Cada inicio de sesión crea una sesión de 8 horas. Revocar una sesión la cierra en ese
          dispositivo.
        </p>
        {sessions.length === 0 ? (
          <p className="muted">No hay otras sesiones activas.</p>
        ) : (
          <ul className="config-rows">
            {sessions.map((item) => (
              <li key={item.id} className="check-ok">
                <div className="config-main">
                  <p className="check-label">
                    {item.current ? "Esta sesión" : "Sesión"} · {fmtDate(item.createdAt)}
                  </p>
                  <p className="muted">
                    Última actividad: {fmtDate(item.lastSeenAt)}
                    {item.userAgent ? ` · ${item.userAgent.slice(0, 80)}` : ""}
                  </p>
                </div>
                <div className="config-where">
                  {item.current ? (
                    <span className="muted">Actual</span>
                  ) : (
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={busy === `session-${item.id}`}
                      onClick={() => revokeSession(item.id)}
                    >
                      Revocar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="sec-passkeys">
        <h2 id="sec-passkeys">Mis passkeys</h2>
        <p className="muted">
          Entrada sin contraseña con huella, cara o llave de seguridad. Cada passkey queda ligada
          a este dominio; un reto reutilizado se rechaza.
        </p>
        {passkeys.length === 0 ? (
          <p className="muted">Sin passkeys todavía.</p>
        ) : (
          <ul className="config-rows">
            {passkeys.map((item) => (
              <li key={item.id} className="check-ok">
                <div className="config-main">
                  <p className="check-label">{item.label || "Passkey"}</p>
                  <p className="muted">
                    Creada: {fmtDate(item.createdAt)} · Último uso: {fmtDate(item.lastUsedAt)}
                  </p>
                </div>
                <div className="config-where">
                  <button
                    className="btn secondary small"
                    type="button"
                    disabled={busy === `revoke-${item.credentialId}`}
                    onClick={() => revokePasskey(item.credentialId)}
                  >
                    Revocar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row-actions">
          <button className="btn small" type="button" disabled={busy === "passkey"} onClick={registerPasskey}>
            {busy === "passkey" ? "Esperando al autenticador…" : "Registrar passkey"}
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="sec-totp">
        <h2 id="sec-totp">Código TOTP</h2>
        <p className="muted">
          Código de 6 dígitos de una app autenticadora.{" "}
          {totpState.enrolled
            ? totpState.source === "account"
              ? "Activo para tu cuenta (secreto propio cifrado en la base)."
              : "Activo por el secreto del entorno (ADMIN_TOTP_SECRET)."
            : mfaRequired
              ? "Sin enrolar. Con MFA obligatorio, el login se bloquea hasta enrolar un método."
              : "Sin enrolar."}
        </p>
        {!totpState.enrolled && !canEnrolTotp ? (
          <p className="muted">
            El TOTP por cuenta exige migrar la cuenta a la base. Mientras tanto, el MFA sigue por
            ADMIN_TOTP_SECRET.
          </p>
        ) : null}
        {!totpSecret && (!totpState.enrolled || totpState.source === "env") && canEnrolTotp ? (
          <button className="btn small" type="button" disabled={busy === "totp-start"} onClick={startTotpEnrol}>
            {busy === "totp-start" ? "Generando…" : "Generar secreto TOTP"}
          </button>
        ) : null}
        {totpSecret ? (
          <form onSubmit={confirmTotpEnrol}>
            <p className="muted">
              Añade este secreto a tu app autenticadora. El secreto NO se guarda hasta que el
              código verifique.
            </p>
            <label className="field">
              Secreto
              <input type="text" value={totpSecret} readOnly onFocus={(event) => event.target.select()} />
            </label>
            {totpUrl ? (
              <p className="muted">
                O abre este enlace en el teléfono:{" "}
                <a href={totpUrl}>añadir a la app autenticadora</a>
              </p>
            ) : null}
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
              <button className="btn small" type="submit" disabled={busy === "totp-confirm" || totpCode.length !== 6}>
                {busy === "totp-confirm" ? "Verificando…" : "Verificar y guardar"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="sec-recovery">
        <h2 id="sec-recovery">Códigos de recuperación</h2>
        <p className="muted">
          Si pierdes el TOTP o la passkey, un código te deja entrar una sola vez. Quedan{" "}
          {recoveryRemaining} sin usar. Generar de nuevo invalida los anteriores sin usar.
        </p>
        <button className="btn small" type="button" disabled={busy === "recovery"} onClick={generateRecoveryCodes}>
          {busy === "recovery" ? "Generando…" : "Generar 10 códigos nuevos"}
        </button>
        {recoveryCodes ? (
          <div>
            <p className="muted">
              Guárdalos ahora: no se vuelven a mostrar. Cada uno vale una sola vez.
            </p>
            <ul>
              {recoveryCodes.map((code) => (
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
