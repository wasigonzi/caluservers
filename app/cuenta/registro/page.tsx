import Link from "next/link";
import { AccountFrame } from "@/components/account/AccountFrame";
import { RegisterForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AccountFrame
      kicker="Cuenta CaluServers"
      title="Crear cuenta"
      lead="Esta cuenta es de CaluServers. No crea un usuario en el portal anterior ni un servicio en WHM."
    >
      <section className="account-card glass">
        {customerAuthReady ? <RegisterForm /> : <p className="error" role="alert">Falta BETTER_AUTH_SECRET. El registro está cerrado.</p>}
        <p><Link href="/cuenta/entrar">Ya tengo cuenta</Link></p>
      </section>
    </AccountFrame>
  );
}
