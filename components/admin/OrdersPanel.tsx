"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type AdminOrder = {
  id: string;
  number: string;
  customerName: string;
  customerEmail: string;
  domain: string;
  planName: string;
  price: string;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
  whmUsername: string | null;
  whmPackage: string | null;
  provisionAttempts: number;
  provisionError: string | null;
  createdAt: string;
  password: string | null;
  trackingUrl: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pagado",
  provisioning: "Aprovisionando",
  active: "Activo",
  provision_failed: "Fallo de aprovisionamiento",
  cancelled: "Cancelado",
};

export default function OrdersPanel({
  orders,
  configured,
}: {
  orders: AdminOrder[];
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function call(
    order: AdminOrder,
    action: "confirm-payment" | "retry",
  ) {
    setBusy(order.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const value: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          value && typeof value === "object" && "error" in value
            ? String((value as { error: unknown }).error)
            : "La operación no se pudo completar.";
        setError(message);
        return;
      }
      const status =
        value && typeof value === "object" && "status" in value
          ? String((value as { status: unknown }).status)
          : "";
      setNotice(
        action === "confirm-payment"
          ? `Pago confirmado para ${order.number}${
              status ? ` — estado: ${STATUS_LABEL[status] ?? status}` : ""
            }.`
          : `Reintento enviado para ${order.number}${
              status ? ` — estado: ${STATUS_LABEL[status] ?? status}` : ""
            }.`,
      );
      setConfirming(null);
      router.refresh();
    } catch {
      setError("La operación no se pudo completar.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copiado.`);
    } catch {
      setError("No se pudo copiar.");
    }
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <p role="alert" className="error">
          WHM no está configurado: los pedidos se pueden registrar y confirmar,
          pero el aprovisionamiento fallará hasta que configures servidor,
          usuario y token en{" "}
          <Link href="/admin/settings">Conexión WHM</Link>.
        </p>
      ) : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {orders.length === 0 ? (
        <p className="muted">
          Sin pedidos todavía. Los pedidos creados desde el checkout de la web
          aparecen aquí con su pago y su aprovisionamiento.
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="glass">
              <div className="flex justify-between">
                <div>
                  <h2>
                    {order.number} — {order.planName} · {order.price} / mes
                  </h2>
                  <p className="muted">
                    {order.customerName} · {order.customerEmail}
                    <br />
                    Dominio: {order.domain} · Pedido:{" "}
                    {new Date(order.createdAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <span className="tag">
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="muted">
                Pago:{" "}
                {order.paidAt
                  ? `confirmado el ${new Date(order.paidAt).toLocaleDateString("es-ES")}${
                      order.paymentRef ? ` (ref. ${order.paymentRef})` : ""
                    }`
                  : "pendiente"}
                {order.whmUsername
                  ? ` · Usuario WHM: ${order.whmUsername}`
                  : ""}
                {order.whmPackage ? ` · Paquete: ${order.whmPackage}` : ""}
                {order.provisionAttempts > 0
                  ? ` · Intentos de aprovisionamiento: ${order.provisionAttempts}`
                  : ""}
              </p>
              {order.status === "provision_failed" && order.provisionError ? (
                <p role="alert" className="error">
                  Error de aprovisionamiento: {order.provisionError}
                </p>
              ) : null}
              {order.password ? (
                <p className="muted">
                  Contraseña cPanel:{" "}
                  <code>{order.password}</code>{" "}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => copy(order.password ?? "", "Contraseña")}
                  >
                    Copiar
                  </button>{" "}
                  <span>
                    Compártela con el cliente; no queda visible en su panel.
                  </span>
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    copy(
                      `${window.location.origin}${order.trackingUrl}`,
                      "Enlace de seguimiento",
                    )
                  }
                >
                  Copiar enlace de seguimiento
                </button>
                {order.status === "pending_payment" ? (
                  confirming === order.id ? (
                    <>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy === order.id}
                        onClick={() => call(order, "confirm-payment")}
                      >
                        {busy === order.id
                          ? "Confirmando…"
                          : "Sí, confirmar pago y crear cuenta"}
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setConfirming(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => setConfirming(order.id)}
                    >
                      Confirmar pago
                    </button>
                  )
                ) : null}
                {order.status === "provision_failed" ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy === order.id}
                    onClick={() => call(order, "retry")}
                  >
                    {busy === order.id ? "Reintentando…" : "Reintentar"}
                  </button>
                ) : null}
                {order.whmUsername ? (
                  <Link className="btn secondary" href="/admin/accounts">
                    Ver en Cuentas →
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
