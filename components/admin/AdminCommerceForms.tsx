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
}: {
  invoiceId?: string;
  serviceId?: string;
  ticketId?: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  return (
    <div>
      {invoiceId ? (
        <form
          className="commerce-action"
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
          <p className="muted">No hay pasarela. Anotar el cobro no da de alta el servicio.</p>
          <label className="field">Nota del cobro manual<input value={note} onChange={(event) => setNote(event.target.value)} required minLength={8} /></label>
          <button className="btn" type="submit">Confirmar pago manual</button>
        </form>
      ) : null}
      {serviceId ? (
        <form
          className="commerce-action"
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
          <p className="muted">Registrar la activación no llama a WHM ni crea una cuenta de cPanel.</p>
          <label className="field">Nota de activación manual<input value={note} onChange={(event) => setNote(event.target.value)} required minLength={8} /></label>
          <button className="btn" type="submit">Registrar activación manual</button>
        </form>
      ) : null}
      {ticketId ? (
        <form
          className="commerce-action"
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
    </div>
  );
}
