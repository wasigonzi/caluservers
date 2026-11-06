import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings-db";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";

export const dynamic = "force-dynamic";

export default async function SiteAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const settings = await getSiteSettings();
  return (
    <>
      <p className="accent">SITIO PÚBLICO</p>
      <h1>Configuración del sitio</h1>
      <p className="muted">
        General / Contenido / Apariencia. Los cambios se aplican a la web pública tras
        guardar. Requiere migración Prisma <code>SiteSetting</code> aplicada en la base
        de datos. Defaults documentados en <code>lib/site-settings.ts</code>.
      </p>
      <div className="glass">
        <SiteSettingsForm initial={settings} />
      </div>
    </>
  );
}
