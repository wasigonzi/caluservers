import { AccountFrame } from "@/components/account/AccountFrame";
import { PaypalReturnStatus } from "@/components/account/PaypalSandboxActions";

export const dynamic = "force-dynamic";

export default async function PaypalReturnPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <AccountFrame
      kicker="PRUEBAS"
      title="Confirmación de PayPal"
      lead="PRUEBAS · sin dinero real. El regreso del navegador no cobra ni da de alta el servicio. El servidor tiene que confirmar el importe."
    >
      <section className="account-card glass">
        {token ? <PaypalReturnStatus paypalOrderId={token} /> : <p className="error">Falta el identificador del checkout de prueba.</p>}
      </section>
    </AccountFrame>
  );
}
