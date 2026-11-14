import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { whmConfiguration } from "@/lib/whm";
import { cpanelUrlFromWhmEndpoint } from "@/lib/provisioning";
import { PageHero } from "@/components/site/SiteShell";

export const metadata: Metadata = { title: "Seguimiento de pedido | CaluServers" };
export const dynamic = "force-dynamic";

const STEPS: { id: string; label: string }[] = [
  { id: "pending_payment", label: "Pedido recibido" },
  { id: "paid", label: "Pago confirmado" },
  { id: "provisioning", label: "Creando tu cuenta" },
  { id: "active", label: "Cuenta activa" },
];

function stepIndex(status: string): number {
  if (status === "active") return 4;
  if (status === "provisioning") return 3;
  if (status === "paid") return 2;
  return 1;
}

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { lookupToken: token },
    include: { hostingAccount: true },
  });
  if (!order) notFound();
  let cpanelUrl: string | null = null;
  try {
    const cfg = await whmConfiguration();
    if (cfg.url) cpanelUrl = cpanelUrlFromWhmEndpoint(cfg.url);
  } catch {
    cpanelUrl = null;
  }
  const failed = order.status === "provision_failed";
  const current = stepIndex(order.status);
  return (
    <>
      <PageHero
        kicker="SEGUIMIENTO DE PEDIDO"
        title={
          <>
            Pedido <span className="neon-text">{order.number}</span>
          </>
        }
        lead="Aquí ves el estado de tu pedido y de tu cuenta de hosting."
      />
      <section className="wrap">
        <div className="glass">
          <h2>
            {order.planName} — {order.price} / mes
          </h2>
          <p className="muted">
            Dominio: {order.domain} · Cliente: {order.customerName}
          </p>
          {failed ? (
            <p role="alert" className="error">
              Hubo un problema creando tu cuenta de hosting. Ya estamos al
              tanto: escríbenos a soporte@caluservers.com con tu número de
              pedido {order.number} y lo resolvemos.
            </p>
          ) : (
            <ol>
              {STEPS.map((step, i) => (
                <li key={step.id}>
                  {i + 1 < current
                    ? `✓ ${step.label}`
                    : i + 1 === current
                      ? `• ${step.label}`
                      : `○ ${step.label}`}
                </li>
              ))}
            </ol>
          )}
          {order.status === "pending_payment" ? (
            <p className="muted">
              Tu pedido está registrado y pendiente de pago. Cuando el pago se
              confirme, tu cuenta se crea automáticamente.
            </p>
          ) : null}
          {order.hostingAccount ? (
            <div className="field">
              <h3>Tu cuenta de hosting</h3>
              <p className="muted">
                Usuario cPanel: {order.hostingAccount.whmUsername}
                <br />
                Paquete: {order.hostingAccount.package}
                <br />
                Estado:{" "}
                {order.hostingAccount.status === "active"
                  ? "Activa"
                  : "Suspendida"}
              </p>
              {cpanelUrl ? (
                <a
                  className="btn primary"
                  href={cpanelUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir cPanel →
                </a>
              ) : null}
              <p className="muted">
                Tus credenciales de acceso te las enviamos al correo{" "}
                {order.customerEmail}. Si no las recibes, escríbenos a
                soporte@caluservers.com.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
