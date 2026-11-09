import { notFound } from "next/navigation";
import { AccountFrame } from "@/components/account/AccountFrame";
import { PaypalSimulateForm } from "@/components/account/PaypalSandboxActions";
import { paypalRuntime } from "@/lib/paypal-sandbox";

export const dynamic = "force-dynamic";

export default async function PaypalSimulatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const runtime = paypalRuntime();
  if (!runtime.ok || !runtime.fixture) notFound();
  const { token = "" } = await searchParams;
  return (
    <AccountFrame
      kicker="PRUEBAS"
      title="Simulador de PayPal"
      lead="PRUEBAS · sin dinero real. Esta pantalla no es PayPal y no envía datos de tarjeta. La aprobación solo existe en este entorno aislado."
    >
      <section className="account-card glass">
        <p className="account-price">El importe lo calcula el servidor a partir de la factura.</p>
        {token ? <PaypalSimulateForm paypalOrderId={token} /> : <p className="error">Falta el identificador.</p>}
      </section>
    </AccountFrame>
  );
}
