import { AccountFrame } from "@/components/account/AccountFrame";

export const dynamic = "force-dynamic";

export default function PaypalCancelPage() {
  return (
    <AccountFrame
      kicker="PRUEBAS"
      title="Pago de prueba cancelado"
      lead="PRUEBAS · sin dinero real. Cancelar no crea un servicio ni cambia la proforma a factura emitida."
    >
      <section className="account-card glass">
        <p>No se ha capturado ningún pago.</p>
      </section>
    </AccountFrame>
  );
}
