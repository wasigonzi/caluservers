import Link from "next/link";
import { RegisterForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Crear cuenta</h1>
      <p className="muted">Con tu cuenta contratas planes, pagas facturas y pides soporte.</p>
      {customerAuthReady ? <RegisterForm /> : <p className="error" role="alert">El registro no está disponible en este momento. Vuelve a intentarlo en unos minutos.</p>}
      <p><Link href="/cuenta/entrar">Ya tengo cuenta</Link></p>
    </main>
  );
}
