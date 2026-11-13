"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marca un mensaje como leído o archivado. No borra: el histórico se conserva. */
export default function MessageActions({
  messageId,
  status,
}: {
  messageId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function move(next: "read" | "archived" | "new") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/commerce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "message-status", messageId, status: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || "No se pudo actualizar.");
        return;
      }
      router.refresh();
    } catch {
      setError("No hubo conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      {status !== "read" ? (
        <button className="btn" type="button" disabled={busy} onClick={() => move("read")}>
          Marcar leído
        </button>
      ) : null}
      {status !== "archived" ? (
        <button className="btn" type="button" disabled={busy} onClick={() => move("archived")}>
          Archivar
        </button>
      ) : (
        <button className="btn" type="button" disabled={busy} onClick={() => move("new")}>
          Devolver a nuevos
        </button>
      )}
      {error ? (
        <span className="error" role="alert">
          {" "}
          {error}
        </span>
      ) : null}
    </span>
  );
}
