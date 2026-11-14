"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

async function post(body: Record<string, string>) {
  const response = await fetch("/api/admin/commerce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "No se pudo completar la operación.");
  return data;
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
  return (
    <>
      <button
        className={`btn small ${tone === "primary" ? "" : tone}`}
        type="button"
        onClick={() => {
          setError("");
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
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const data = await post({ ...payload, note });
              setNote("");
              dialog.current?.close();
              // El cobro quedó registrado aunque el alta automática no saliera.
              setWarning(
                data?.provisionNote ? `Hecho, pero el alta automática no salió: ${data.provisionNote}` : "",
              );
              router.refresh();
            } catch (err) {
              setError(messageOf(err));
            } finally {
              setBusy(false);
            }
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

/**
 * Marca el correo del cliente como verificado. No envía ningún correo: solo
 * desbloquea el acceso cuando el enlace de verificación nunca llegó.
 */
export function VerifyEmailButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        className="btn secondary small"
        type="button"
        disabled={busy || done}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await post({ action: "verify-email", userId });
            setDone(true);
            router.refresh();
          } catch (err) {
            setError(messageOf(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {done ? "Correo verificado" : busy ? "Guardando…" : "Marcar correo como verificado"}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
