"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Botones de "marcar como leída" de /admin/alertas. */
export function MarkReadButton({ id }: { id: string }) {
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
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/admin/alerts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "mark-read", id }),
            });
            if (!response.ok) throw new Error("No se pudo marcar la alerta.");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo marcar la alerta.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Marcar como leída
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}

export function MarkAllReadButton() {
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
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/admin/alerts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "mark-all-read" }),
            });
            if (!response.ok) throw new Error("No se pudieron marcar las alertas.");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudieron marcar las alertas.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Marcar todas como leídas
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
