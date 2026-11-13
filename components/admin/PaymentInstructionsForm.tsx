"use client";

import { useState } from "react";

export default function PaymentInstructionsForm({ initial, max }: { initial: string; max: number }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
          const response = await fetch("/api/admin/system", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "save-payment-instructions", text }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setMessage({ ok: false, text: data?.error || "No se pudo guardar." });
          } else {
            setText(data.text);
            setSaved(data.text);
            setMessage({
              ok: true,
              text: data.text
                ? "Guardado. Ya aparece en las facturas pendientes de tus clientes."
                : "Guardado. Las facturas ya no muestran instrucciones de pago manual.",
            });
          }
        } catch {
          setMessage({ ok: false, text: "No hubo conexión con el servidor." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Texto para el cliente
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={max}
          rows={5}
          placeholder={"Ej.: ATH Móvil al 787-000-0000 a nombre de…\nTransferencia: Banco…, cuenta…"}
        />
      </label>
      <div className="row-actions">
        <button className="btn small" type="submit" disabled={busy || text === saved}>
          {busy ? "Guardando…" : "Guardar instrucciones"}
        </button>
        <span className="muted">
          {text.length}/{max}
        </span>
        {message ? (
          <span className={message.ok ? "ok" : "error"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
