import { RecoverForm } from "@/components/account/AccountForms";
import { mailerConfigured, RESET_MAIL_UNAVAILABLE_MESSAGE } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export default function RecoverPage() {
  // Honesto desde el servidor: sin SMTP no se promete un enlace que nunca
  // llegará (antes RecoverForm siempre decía "enviaremos un enlace" aunque
  // deliverAuthLink devolviera delivered:false).
  const mailConfigured = mailerConfigured();
  return (
    <main className="wrap" style={{ padding: "48px 0" }}>
      <h1>Recuperar contraseña</h1>
      <p className="muted">
        {mailConfigured
          ? "El enlace caduca y no aparece en esta página."
          : "El restablecimiento por correo no está activo."}
      </p>
      <RecoverForm
        mailConfigured={mailConfigured}
        unavailableMessage={RESET_MAIL_UNAVAILABLE_MESSAGE}
      />
    </main>
  );
}
