"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Server, Layers3 } from "lucide-react";
import type { WhmRows } from "@/lib/whm-transport";

type Overview = {
  connected: true;
  checkedAt: string;
  accounts: WhmRows;
  packages: WhmRows;
};
const REFRESH_MS = 60_000;
const TIME = new Intl.DateTimeFormat("es", { timeStyle: "short" });

export default function WhmReadPanel({
  configured,
  mode = "overview",
  storageError = "",
}: {
  configured: boolean;
  mode?: "overview" | "listaccts" | "listpkgs";
  storageError?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<Overview | WhmRows | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const inFlight = useRef(false);
  const failed = useRef(false);
  const canRead = configured && !storageError;

  const read = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/whm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: mode }),
      });
      const data = await r.json();
      if (!r.ok) throw Error("not-confirmed");
      if (
        mode === "overview"
          ? data.connected !== true ||
            typeof data.checkedAt !== "string" ||
            !Number.isFinite(Date.parse(data.checkedAt)) ||
            !Array.isArray(data.accounts?.rows) ||
            !Array.isArray(data.packages?.rows)
          : !Array.isArray(data.rows)
      )
        throw Error("invalid");
      failed.current = false;
      setResult(data);
      setReadAt(new Date());
    } catch {
      // Un dato viejo no se deja en pantalla como si fuera el actual.
      failed.current = true;
      setResult(null);
      setError(
        "Lectura no confirmada. Revisa la configuración, permisos del token y conectividad HTTPS con el servidor. La actualización automática queda en pausa hasta que pulses «Actualizar».",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [mode]);

  // Lee al abrir la página y se mantiene al día: cada minuto con la pestaña visible
  // y al volver a ella. Tras un fallo se detiene, para no insistir contra un servidor caído.
  useEffect(() => {
    if (!canRead) return;
    void read();
    const tick = () => {
      if (document.visibilityState === "visible" && !failed.current) void read();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [canRead, read]);

  const overview = mode === "overview" && result ? (result as Overview) : null;
  const table = mode !== "overview" && result ? (result as WhmRows) : null;
  const columns =
    mode === "listaccts"
      ? [
          ["user", "Usuario"],
          ["domain", "Dominio"],
          ["plan", "Paquete"],
          ["suspended", "Estado"],
          ["diskused", "Disco usado"],
          ["disklimit", "Cuota"],
        ]
      : [
          ["name", "Nombre"],
          ["QUOTA", "Cuota MB"],
          ["BWLIMIT", "Transferencia MB"],
          ["MAXPOP", "Correo"],
          ["MAXSQL", "Bases de datos"],
        ];
  return (
    <section className="whm-read-panel" aria-busy={busy}>
      <div className="dashboard-section-heading">
        <div>
          <h2>
            {mode === "overview"
              ? "Servidor WHM / cPanel"
              : mode === "listaccts"
                ? "Cuentas accesibles"
                : "Paquetes accesibles"}
          </h2>
          <p className="muted">
            Sólo lectura · alcance del usuario root/reseller. Sin facturación ni
            cambios de cuentas.
          </p>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={!canRead || busy}
          onClick={() => {
            failed.current = false;
            void read();
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      <p role="status" className="muted">
        {storageError
          ? "Almacenamiento no disponible"
          : !configured
            ? "Pendiente configuración: servidor, usuario y token."
            : error
              ? "No conectado / lectura fallida"
              : result
                ? `Lectura confirmada por WHM${readAt ? ` a las ${TIME.format(readAt)}` : ""}. Se actualiza sola cada minuto.`
                : "Consultando WHM por HTTPS…"}
      </p>
      {storageError || error ? (
        <p role="alert" className="error">
          {storageError || error}
        </p>
      ) : null}
      {!configured ? (
        <Link className="btn secondary" href="/admin/settings">
          Configurar WHM →
        </Link>
      ) : null}
      {mode === "overview" ? (
        <div className="metrics whm-metrics">
          {[
            { label: "Cuentas", Icon: Server, value: overview?.accounts.total },
            {
              label: "Paquetes",
              Icon: Layers3,
              value: overview?.packages.total,
            },
          ].map(({ label, Icon, value }) => (
            <div className="glass metric" key={label}>
              <div className="metric-label">
                <Icon size={18} aria-hidden="true" />
                {label}
              </div>
              <strong>{value ?? "—"}</strong>
              <span className="muted">
                {value === undefined
                  ? "Sin datos verificados"
                  : "Accesibles para este usuario"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {overview ? (
        <p className="muted whm-query-time">
          Última consulta:{" "}
          {new Intl.DateTimeFormat("es", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Halifax",
          }).format(new Date(overview.checkedAt))}{" "}
          (Halifax).
        </p>
      ) : null}
      {table ? (
        <>
          <p className="muted">
            {table.total} registros devueltos · mostrando {table.rows.length}
            {table.truncated ? " (límite de 100 filas)" : ""}.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr key={index}>
                    {columns.map(([key]) => (
                      <td key={key}>
                        {key === "suspended"
                          ? row[key] === "1"
                            ? "Suspendida"
                            : row[key] === "0"
                              ? "Activa"
                              : "No informado"
                          : (row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.total === 0 ? (
            <p className="muted">
              No hay registros accesibles para este usuario.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
