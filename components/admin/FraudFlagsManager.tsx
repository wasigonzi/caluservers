"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type FraudFlagItem = {
  id: string;
  userId: string;
  orderId: string | null;
  ruleName: string | null;
  reason: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

/** Lista de flags con aprobar / confirmar. Las acciones van a /api/admin/fraud. */
export default function FraudFlagsManager({ flags }: { flags: FraudFlagItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(flagId: string, action: "clear" | "confirm") {
    setBusy(flagId);
    setError(null);
    try {
      const res = await fetch("/api/admin/fraud", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, flagId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo guardar la revisión.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la revisión.");
    } finally {
      setBusy(null);
    }
  }

  if (flags.length === 0) {
    return <p className="muted">No hay flags abiertos. Cuando una regla marque un pedido, aparecerá aquí.</p>;
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Regla</th>
            <th>Motivo</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <tr key={flag.id}>
              <td>{flag.createdAt}</td>
              <td>{flag.ruleName ?? "—"}</td>
              <td>{flag.reason}</td>
              <td>{flag.orderId ?? "—"}</td>
              <td>{flag.status === "open" ? "Abierto" : flag.status === "cleared" ? "Aprobado" : "Confirmado"}</td>
              <td>
                {flag.status === "open" ? (
                  <>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy === flag.id}
                      onClick={() => void review(flag.id, "clear")}
                    >
                      Aprobar
                    </button>{" "}
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy === flag.id}
                      onClick={() => void review(flag.id, "confirm")}
                    >
                      Confirmar fraude
                    </button>
                  </>
                ) : (
                  <span className="muted">
                    {flag.reviewedBy ?? ""} {flag.reviewedAt ?? ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
