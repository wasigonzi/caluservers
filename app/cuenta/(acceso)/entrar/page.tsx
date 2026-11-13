import Link from "next/link";
import { LoginForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Entrar</h1>
      <p className="muted">Entra con el correo y la contraseña de tu cuenta.</p>
      {customerAuthReady ? <LoginForm /> : <p className="error" role="alert">El área de clientes no está disponible en este momento. Vuelve a intentarlo en unos minutos.</p>}
      <p><Link href="/cuenta/registro">Crear cuenta</Link> · <Link href="/cuenta/recuperar">Olvidé la contraseña</Link></p>
    </main>
  );
}
