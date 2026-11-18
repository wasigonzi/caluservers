import { PageHeader } from "@/components/admin/ui";
import AccountSecurityForms from "@/components/account/SecurityForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguridad" };

export default function AccountSecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="MI CUENTA"
        title="Seguridad"
        description="Tus passkeys y la verificación en dos pasos de tu cuenta. Las passkeys entran sin contraseña; el TOTP es opcional y solo se exige si lo activas y verificas."
      />
      <AccountSecurityForms />
    </>
  );
}
