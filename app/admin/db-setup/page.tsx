"use client";

import { useCallback, useEffect, useState } from "react";

type Diag = Record<string, unknown>;

export default function DbSetupPage() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/db-setup", { cache: "no-store" });
      const data = await res.json();
      setDiag(data);
      if (!res.ok) setMsg(data.error || data.note || `HTTP ${res.status}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
      setDiag(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(action: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/db-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setDiag(data.after && typeof data.after === "object" ? data.after : data);
      if (!res.ok || data.ok === false) {
        setMsg(data.error || data.note || `HTTP ${res.status} — no es éxito`);
      } else {
        setMsg(data.note || "OK");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel" style={{ maxWidth: 720, padding: "1.25rem" }}>
      <h1>TEMP · Diagnóstico BD</h1>
      <p className="muted">
        Solo admin. GET/POST fijos (sin SQL arbitrario). Quitar tras Supabase
        usable. POST exige Origin=Host (CSRF).
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" disabled={busy} onClick={() => void load()}>
          Diagnosticar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post("apply")}
        >
          Aplicar migraciones CREATE
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post("probe_write")}
        >
          Probe escritura/borrado
        </button>
      </div>
      {msg ? (
        <p className="error" role="status">
          {msg}
        </p>
      ) : null}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 12,
          background: "#0b1220",
          color: "#e2e8f0",
          padding: 12,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {diag ? JSON.stringify(diag, null, 2) : busy ? "…" : "sin datos"}
      </pre>
    </div>
  );
}
