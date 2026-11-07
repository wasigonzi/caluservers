"use client";
import { useState } from "react";
import WhmManagementDialog, {
  WHM_ACTION_LABELS,
} from "@/components/admin/WhmManagementDialog";
import type { WhmManagementAction } from "@/lib/whm-management-schema";
import { useWhmAutoRead } from "@/components/admin/useWhmAutoRead";
import Link from "next/link";
import { RefreshCw, Server, Layers3 } from "lucide-react";
import type { WhmRows } from "@/lib/whm-transport";

function validRows(value: unknown): value is WhmRows {
  if (!value || typeof value !== "object") return false;
  const rows = value as WhmRows;
  return (
    Array.isArray(rows.rows) &&
    rows.rows.length <= 100 &&
    Number.isSafeInteger(rows.total) &&
    rows.total >= rows.rows.length &&
    typeof rows.truncated === "boolean" &&
    rows.rows.every(
      (row) =>
        row &&
        typeof row === "object" &&
        Object.values(row).every(
          (v) => typeof v === "string" && v.length <= 120,
        ),
    )
  );
}
function validOverview(value: unknown): value is Overview {
  if (!value || typeof value !== "object") return false;
  const item = value as Overview;
  return (
    item.connected === true &&
    typeof item.checkedAt === "string" &&
    Number.isFinite(Date.parse(item.checkedAt)) &&
    validRows(item.accounts) &&
    validRows(item.packages)
  );
}
type Overview = {
  connected: true;
  checkedAt: string;
  accounts: WhmRows;
  packages: WhmRows;
};
export default function WhmReadPanel({
  configured,
  mode = "overview",
  storageError = "",
}: {
  configured: boolean;
  mode?: "overview" | "listaccts" | "listpkgs";
  storageError?: string;
}) {
  const [management, setManagement] = useState<{
    action: WhmManagementAction;
    row?: Record<string, string>;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const managing = Boolean(management);
  const operation = mode;
  const { result, lastRead, busy, error, paused, refresh } = useWhmAutoRead<
    Overview | WhmRows
  >(
    operation,
    configured && !storageError && !managing,
    operation === "overview" ? validOverview : validRows,
  );
  const relatedPackages = useWhmAutoRead<WhmRows>(
    "listpkgs",
    mode === "listaccts" && configured && !storageError && !managing,
    validRows,
  );
  const packages = relatedPackages.result?.rows || [];
  const overview =
    operation === "overview" && result ? (result as Overview) : null;
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
            Lectura automática cada 45 segundos mientras esta pestaña esté
            visible y online. Alcance del usuario root/reseller.
          </p>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={!configured || busy || paused || Boolean(storageError)}
          onClick={() => {
            refresh();
            if (mode === "listaccts") relatedPackages.refresh();
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {busy ? "Consultando…" : "Consultar ahora"}
        </button>
      </div>
      <p role="status" className="muted">
        {storageError
          ? "Almacenamiento no disponible"
          : !configured
            ? "Pendiente configuración: servidor, usuario y token."
            : busy
              ? "Consultando WHM por HTTPS…"
              : paused
                ? "Actualización en pausa (pestaña oculta, offline o gestión activa)"
                : error
                  ? "No conectado / lectura fallida"
                  : result
                    ? "Lectura confirmada por WHM"
                    : "Cargando datos WHM…"}
      </p>
      {storageError || error ? (
        <p role="alert" className="error">
          {storageError ||
            "No se pudo actualizar. Los datos anteriores se conservan; próximo intento con espera progresiva. Revisa conectividad y permisos."}
        </p>
      ) : null}
      {!configured ? (
        <Link className="btn secondary" href="/admin/settings">
          Configurar WHM →
        </Link>
      ) : null}
      {notice ? (
        <p className="ok" role="status">
          {notice}
        </p>
      ) : null}
      {mode !== "overview" ? (
        <div className="whm-management-toolbar">
          <button
            type="button"
            className="btn"
            disabled={
              !result ||
              busy ||
              error ||
              paused ||
              (mode === "listaccts" && !packages.length)
            }
            onClick={() => {
              setNotice("");
              setManagement({
                action: mode === "listaccts" ? "createacct" : "addpkg",
              });
            }}
          >
            {mode === "listaccts" ? "Crear cuenta" : "Crear paquete"}
          </button>
          <span className="muted">
            Confirmación obligatoria · permisos WHM comprobados por operación ·
            sin eliminación ni cambio de contraseña
          </span>
        </div>
      ) : null}
      {management ? (
        <WhmManagementDialog
          action={management.action}
          row={management.row}
          packages={packages}
          onClose={() => setManagement(null)}
          onSuccess={(message) => {
            setNotice(message);
            setManagement(null);
          }}
        />
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
      {result && (error || paused) ? (
        <span className="pill whm-stale" role="status">
          Datos anteriores · pendientes de actualizar
        </span>
      ) : null}
      {lastRead ? (
        <p className="muted whm-query-time">
          Última consulta:{" "}
          {new Intl.DateTimeFormat("es", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Halifax",
          }).format(new Date(lastRead))}{" "}
          (Halifax). Actualización automática 45s; se pausa al ocultar la
          pestaña o perder conexión.
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
                  <th>Gestión</th>
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
                    <td>
                      <div className="whm-row-actions">
                        {(mode === "listaccts"
                          ? [
                              row.suspended === "1"
                                ? "unsuspendacct"
                                : "suspendacct",
                              "changepackage",
                            ]
                          : ["editpkg"]
                        ).map((action) => (
                          <button
                            type="button"
                            className="btn secondary"
                            key={action}
                            disabled={
                              busy ||
                              error ||
                              paused ||
                              (mode === "listaccts" &&
                                (!["0", "1"].includes(row.suspended) ||
                                  (action === "changepackage" &&
                                    !packages.length)))
                            }
                            onClick={() => {
                              setNotice("");
                              setManagement({
                                action: action as WhmManagementAction,
                                row,
                              });
                            }}
                          >
                            {WHM_ACTION_LABELS[action as WhmManagementAction]}
                          </button>
                        ))}
                      </div>
                    </td>
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
