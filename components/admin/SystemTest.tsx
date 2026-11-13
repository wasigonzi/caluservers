"use client";

import { useState } from "react";

/** Botón de comprobación: llama a /api/admin/system y muestra el resultado real. */
export default function SystemTest({
  action,
  label,
  disabled = false,
}: {
  action: "test-email" | "test-database";
  label: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="system-test">
      <button
        className="btn secondary small"
        type="button"
        disabled={busy || disabled}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setResult(null);
          try {
            const response = await fetch("/api/admin/system", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              setResult({ ok: false, text: data?.error || "La comprobación falló." });
            } else if (action === "test-email") {
              setResult({
                ok: true,
                text:
                  data.via === "sink"
                    ? `Guardado en el sumidero local de pruebas (para ${data.to}).`
                    : `Enviado a ${data.to}. Revisa la bandeja.`,
              });
            } else {
              setResult({ ok: true, text: `Responde en ${data.ms} ms.` });
            }
          } catch {
            setResult({ ok: false, text: "No hubo conexión con el servidor." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Comprobando…" : label}
      </button>
      {result ? (
        <span className={result.ok ? "ok" : "error"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </span>
      ) : null}
    </span>
  );
}
