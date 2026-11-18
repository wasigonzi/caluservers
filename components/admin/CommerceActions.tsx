"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Error de API con el código de la respuesta, si lo trae. */
export class AdminApiError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
  }
}

async function post(body: Record<string, string>) {
  const response = await fetch("/api/admin/commerce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(
      data?.error === "step-up-required"
        ? data?.message || "Confirma tu identidad para continuar."
        : data?.error || "No se pudo completar la operación.",
      data?.error,
    );
  }
  return data;
}

/**
 * Reautenticación (step-up, Fase 6 frente C): contraseña del admin y, si
 * tiene MFA enrolado, el código TOTP o de recuperación. Al verificar, la
 * sesión queda marcada 15 minutos y `onVerified` reintenta la acción que
 * se quedó a medias.
 */
export function StepUpForm({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/admin/step-up", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password, code: code || undefined }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              data?.mfaRequired
                ? "Falta el código de verificación o no es válido."
                : data?.error || "No se pudo confirmar tu identidad.",
            );
          }
          onVerified();
        } catch (err) {
          setError(messageOf(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Confirma tu identidad</h2>
      <p className="muted">
        Esta operación es delicada y tu última confirmación caducó. Escribe tu contraseña de
        administrador para continuar.
      </p>
      <label className="field">
        Contraseña de administrador
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <label className="field">
        Código de verificación (solo si tienes MFA activado)
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog-actions">
        <button className="btn secondary small" type="button" onClick={onCancel} disabled={busy}>
          Volver
        </button>
        <button className="btn small" type="submit" disabled={busy}>
          {busy ? "Confirmando…" : "Confirmar identidad"}
        </button>
      </div>
    </form>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

/**
 * Acción que exige una nota: abre un diálogo, pide el motivo y lo envía.
 * La nota queda en el diario de actividad junto a quién hizo el cambio.
 */
export function NoteAction({
  trigger,
  title,
  description,
  noteLabel,
  confirmLabel,
  payload,
  tone = "primary",
}: {
  trigger: string;
  title: string;
  description: string;
  noteLabel: string;
  confirmLabel: string;
  payload: Record<string, string>;
  tone?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [needsStepUp, setNeedsStepUp] = useState(false);

  async function runAction() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await post({ ...payload, note });
      setNote("");
      setNeedsStepUp(false);
      dialog.current?.close();
      // El cobro quedó registrado aunque el alta automática no saliera.
      setWarning(
        data?.provisionNote ? `Hecho, pero el alta automática no salió: ${data.provisionNote}` : "",
      );
      router.refresh();
    } catch (err) {
      if (err instanceof AdminApiError && err.code === "step-up-required") {
        setNeedsStepUp(true);
        setError("");
      } else {
        setError(messageOf(err));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={`btn small ${tone === "primary" ? "" : tone}`}
        type="button"
        onClick={() => {
          setError("");
          setNeedsStepUp(false);
          dialog.current?.showModal();
        }}
      >
        {trigger}
      </button>
      {warning ? (
        <p className="notice action-note" role="status">
          {warning}
        </p>
      ) : null}
      <dialog ref={dialog} className="admin-dialog" aria-labelledby={titleId}>
        {needsStepUp ? (
          <StepUpForm
            onVerified={() => void runAction()}
            onCancel={() => {
              setNeedsStepUp(false);
              setError("La operación quedó sin hacer: confirma tu identidad para continuar.");
            }}
          />
        ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await runAction();
          }}
        >
          <h2 id={titleId}>{title}</h2>
          <p className="muted">{description}</p>
          <label className="field">
            {noteLabel}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              minLength={8}
              maxLength={500}
              rows={3}
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="btn secondary small"
              type="button"
              onClick={() => dialog.current?.close()}
            >
              Volver
            </button>
            <button className={`btn small ${tone === "danger" ? "danger" : ""}`} type="submit" disabled={busy}>
              {busy ? "Guardando…" : confirmLabel}
            </button>
          </div>
        </form>
        )}
      </dialog>
    </>
  );
}

/** Crea la cuenta cPanel en WHM. Solo se ofrece con el alta automática lista. */
export function ProvisionButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  return (
    <>
      <button
        className="btn small"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          setInfo("");
          try {
            const data = await post({ action: "provision-service", serviceId });
            setInfo(
              data.credentialsSent
                ? `Cuenta ${data.cpanelUser} creada y datos enviados al cliente.`
                : `Cuenta ${data.cpanelUser} creada, pero el correo con la contraseña no salió. Restablécela en WHM y entrégala tú.`,
            );
            router.refresh();
          } catch (err) {
            setError(messageOf(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Creando cuenta…" : "Dar de alta en WHM ahora"}
      </button>
      {error ? (
        <p className="error action-note" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="notice action-note" role="status">
          {info}
        </p>
      ) : null}
    </>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // Respuestas predefinidas activas (Fase 5, frente C): se cargan del
  // endpoint con permiso `tickets:reply`; si no cargan, el formulario
  // sigue funcionando sin desplegable.
  const [canned, setCanned] = useState<{ id: string; title: string; body: string }[]>([]);
  const [cannedId, setCannedId] = useState("");
  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/canned-replies?active=true&locale=es")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.replies) setCanned(data.replies);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  function insertCanned(id: string) {
    setCannedId(id);
    const found = canned.find((entry) => entry.id === id);
    if (!found) return;
    setReply((current) => (current.trim() ? `${current.trim()}\n\n${found.body}` : found.body));
  }
  return (
    <form
      className="ticket-reply"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setInfo("");
        try {
          const data = await post({ action: "reply-ticket", ticketId, body: reply });
          setReply("");
          setCannedId("");
          setInfo(
            data.notified
              ? "Respuesta guardada y cliente avisado por correo."
              : "Respuesta guardada. No salió aviso por correo: el cliente la verá al entrar en su cuenta.",
          );
          router.refresh();
        } catch (err) {
          setError(messageOf(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {canned.length > 0 ? (
        <label className="field">
          Respuesta predefinida
          <select value={cannedId} onChange={(event) => insertCanned(event.target.value)}>
            <option value="">Sin predefinida…</option>
            {canned.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        Respuesta
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          required
          maxLength={4000}
          rows={5}
        />
      </label>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Enviando…" : "Responder"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="notice" role="status">
          {info}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Subida de adjuntos al ticket por el agente (Fase 5, frente C). Límite
 * 10 MB; solo imágenes, PDF, TXT y ZIP. Sin TICKET_ATTACHMENTS_DIR el
 * servidor rechaza la subida: no se guarda nada en disco sin control.
 */
export function TicketAttachmentForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  return (
    <form
      className="ticket-reply"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const input = form.querySelector<HTMLInputElement>('input[type="file"]');
        const file = input?.files?.[0];
        if (!file) {
          setError("Elige un archivo.");
          return;
        }
        setBusy(true);
        setError("");
        setInfo("");
        try {
          const data = new FormData();
          data.append("file", file);
          const response = await fetch(`/api/admin/tickets/${ticketId}/attachments`, {
            method: "POST",
            body: data,
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "No se pudo subir el adjunto.");
          form.reset();
          setInfo(`Adjunto guardado: ${result.attachment?.fileName ?? file.name}.`);
          router.refresh();
        } catch (err) {
          setError(messageOf(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Adjuntar archivo (máx. 10 MB: imágenes, PDF, TXT o ZIP)
        <input type="file" accept="image/*,.pdf,.txt,.zip" />
      </label>
      <button className="btn secondary" type="submit" disabled={busy}>
        {busy ? "Subiendo…" : "Subir adjunto"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="notice" role="status">
          {info}
        </p>
      ) : null}
    </form>
  );
}

export function TicketStatusButton({
  ticketId,
  status,
}: {
  ticketId: string;
  status: "open" | "closed";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="btn secondary small"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await post({ action: "ticket-status", ticketId, status });
            router.refresh();
          } catch (err) {
            setError(messageOf(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {status === "closed" ? "Cerrar ticket" : "Reabrir ticket"}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

