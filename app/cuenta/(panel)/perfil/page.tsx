import { ChangePasswordForm, ProfileForm } from "@/components/account/AccountForms";
import PortalPreferencesForm from "@/components/account/PortalPreferencesForm";
import { requireCustomer } from "@/lib/account-data";
import { dateOnly } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/admin/ui";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi perfil" };

export default async function AccountProfile() {
  const user = await requireCustomer();
  const cookieValue = (await cookies()).get("calu-locale")?.value;
  let prefs = { locale: "es", portalTheme: "default", portalDensity: "comfortable" };
  try {
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { locale: true, portalTheme: true, portalDensity: true },
    });
    if (row) {
      prefs = {
        locale: row.locale || "es",
        portalTheme: row.portalTheme || "default",
        portalDensity: row.portalDensity || "comfortable",
      };
    }
  } catch {
    // Caída a los valores por defecto.
  }
  const locale = normalizeLocale(cookieValue ?? prefs.locale);
  const dict = getDictionary(locale);
  return (
    <>
      <PageHeader
        eyebrow="ÁREA DE CLIENTE"
        title={dict.portal.profile}
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
        <section className="panel" aria-labelledby="profile-preferences">
          <h2 id="profile-preferences">{dict.portal.preferences}</h2>
          <p className="muted">{dict.portal.preferencesDesc}</p>
          <PortalPreferencesForm initial={prefs} dict={dict} />
        </section>
      </div>
    </>
  );
}
