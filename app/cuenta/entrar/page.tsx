import Link from "next/link";
import { LoginForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function EnterPage() {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Entrar</h1>
      <p className="muted">Solo puedes entrar después de verificar el correo.</p>
      {customerAuthReady ? <LoginForm /> : <p className="error">El área de clientes no está configurada.</p>}
      <p><Link href="/cuenta/registro">Crear cuenta</Link> · <Link href="/cuenta/recuperar">Olvidé la contraseña</Link></p>
    </main>
  );
}
