import Link from "next/link";
import { RegisterForm } from "@/components/account/AccountForms";
import { customerAuthReady } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Crear cuenta</h1>
      <p className="muted">Esta cuenta es de CaluServers. No crea un usuario en el portal anterior.</p>
      {customerAuthReady ? <RegisterForm /> : <p className="error">Falta BETTER_AUTH_SECRET. El registro está cerrado.</p>}
      <p><Link href="/cuenta/entrar">Ya tengo cuenta</Link></p>
    </main>
  );
}
