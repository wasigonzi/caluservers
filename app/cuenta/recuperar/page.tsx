import { RecoverForm } from "@/components/account/AccountForms";

export const dynamic = "force-dynamic";

export default function RecoverPage() {
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Recuperar contraseña</h1>
      <p className="muted">El enlace caduca y no aparece en esta página.</p>
      <RecoverForm />
    </main>
  );
}
