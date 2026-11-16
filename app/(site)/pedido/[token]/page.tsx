import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  customerInvoiceStatus,
  dateOnly,
  orderStatus,
  serviceStatus,
} from "@/lib/admin-format";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seguimiento de pedido" };

/**
 * Seguimiento público de un pedido. No pide sesión: el token es el único
 * identificador, y la página muestra SOLO plan, dominio, estados y fecha.
 * Nunca contraseña de cPanel, correo, ni datos de pago.
 */
export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Tokens generados por la app: 48 hex. La migración rellena los pedidos
  // anteriores con 64 hex. Cualquier otra forma es un 404 honesto.
  if (!/^[A-Za-z0-9]{48}$/.test(token) && !/^[A-Za-z0-9]{64}$/.test(token)) {
    notFound();
  }
  const order = await db.customerOrder.findUnique({
    where: { trackingToken: token },
    include: { invoice: true, service: true },
  });
  if (!order) notFound();

  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <p className="kicker">Seguimiento</p>
      <h1>Seguimiento de pedido</h1>
      <p className="muted">
        Esta página es pública: cualquiera con el enlace puede ver el estado del
        pedido, pero nunca muestra datos de acceso ni de pago.
      </p>
      <dl
        style={{
          display: "grid",
          gap: 12,
          margin: "24px 0",
          padding: 20,
          border: "1px solid rgba(200,230,245,.2)",
          borderRadius: 14,
        }}
      >
        <div>
          <dt className="muted">Plan</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{order.planName}</dd>
        </div>
        {order.domain ? (
          <div>
            <dt className="muted">Dominio</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{order.domain}</dd>
          </div>
        ) : null}
        <div>
          <dt className="muted">Estado del pedido</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>
            {orderStatus(order.status).label}
          </dd>
        </div>
        <div>
          <dt className="muted">Estado de la factura</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>
            {order.invoice
              ? customerInvoiceStatus(order.invoice.status).label
              : "Sin factura"}
          </dd>
        </div>
        <div>
          <dt className="muted">Estado del servicio</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>
            {order.service
              ? serviceStatus(order.service.status).label
              : "Aún no creado"}
          </dd>
        </div>
        <div>
          <dt className="muted">Fecha del pedido</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>
            {dateOnly(order.createdAt)}
          </dd>
        </div>
      </dl>
      <p>
        <Link href="/cuenta/entrar">Entrar a mi cuenta</Link>
        {" · "}
        <Link href="/">Ir al inicio</Link>
      </p>
    </main>
  );
}
