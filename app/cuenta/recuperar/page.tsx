import { AccountFrame } from "@/components/account/AccountFrame";
import { RecoverForm } from "@/components/account/AccountForms";

export const dynamic = "force-dynamic";

export default function RecoverPage() {
  return (
    <AccountFrame
      kicker="Cuenta CaluServers"
      title="Recuperar contraseña"
      lead="El enlace caduca y no aparece en esta página."
    >
      <section className="account-card glass">
        <RecoverForm />
      </section>
    </AccountFrame>
  );
}
