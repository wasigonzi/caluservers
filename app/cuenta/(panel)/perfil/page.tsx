import { ChangePasswordForm, ProfileForm } from "@/components/account/AccountForms";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly } from "@/lib/admin-format";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi perfil" };

export default async function AccountProfile() {
  const user = await requireCustomer();
  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title="Mi perfil"
        description={`Cliente desde el ${dateOnly(user.createdAt)}.`}
      />
      <div className="dash-columns">
        <section className="panel" aria-labelledby="profile-data">
          <h2 id="profile-data">Tus datos</h2>
          <ProfileForm name={user.name} email={user.email} />
        </section>
        <section className="panel" aria-labelledby="profile-password">
          <h2 id="profile-password">Contraseña</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
