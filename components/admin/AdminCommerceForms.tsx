"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(body: Record<string, string>) {
  const response = await fetch("/api/admin/commerce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error");
  return data;
}

export function AdminCommerceForms({
  invoiceId,
  serviceId,
  ticketId,
  canProvision = false,
}: {
  invoiceId?: string;
  serviceId?: string;
  ticketId?: string;
  /** Solo con credenciales, paquete, correo saliente y dominio en el pedido. */
  canProvision?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {invoiceId ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              await post({ action: "confirm-payment", invoiceId, note });
              setNote("");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
        >
          <label className="field">Nota del cobro manual<input value={note} onChange={(event) => setNote(event.target.value)} required minLength={8} /></label>
          <button className="btn" type="submit">Confirmar pago manual</button>
        </form>
      ) : null}
      {serviceId ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              await post({ action: "service-status", serviceId, status: "active", note });
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
        >
          <label className="field">Nota de alta manual<input value={note} onChange={(event) => setNote(event.target.value)} required minLength={8} /></label>
          <button className="btn" type="submit">Marcar alta manual</button>
        </form>
      ) : null}
      {serviceId && canProvision ? (
        <button
          className="btn primary"
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
              setError(err instanceof Error ? err.message : "Error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creando cuenta…" : "Dar de alta en WHM ahora"}
        </button>
      ) : null}
      {ticketId ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              await post({ action: "reply-ticket", ticketId, body: reply });
              setReply("");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          }}
        >
          <label className="field">Respuesta<textarea value={reply} onChange={(event) => setReply(event.target.value)} required /></label>
          <button className="btn" type="submit">Responder</button>
        </form>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {info ? <p className="notice" role="status">{info}</p> : null}
    </div>
  );
}
