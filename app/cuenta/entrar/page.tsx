import Link from "next/link";
import { AccountFrame } from "@/components/account/AccountFrame";
import { LoginForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <AccountFrame
      kicker="Cuenta CaluServers"
      title="Entrar"
      lead="Solo puedes entrar después de verificar el correo. Esta sesión no abre el portal anterior."
    >
      <section className="account-card glass">
        {customerAuthReady ? <LoginForm /> : <p className="error" role="alert">El área de clientes no está configurada.</p>}
        <p><Link href="/cuenta/registro">Crear cuenta</Link> · <Link href="/cuenta/recuperar">Olvidé la contraseña</Link></p>
      </section>
    </AccountFrame>
  );
}
