import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { whmConfiguration, type WhmPublicConfig } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import SettingsForm from "@/components/SettingsForm";
export const dynamic = "force-dynamic";
export default async function Settings() {
  if (!(await isAdmin())) redirect("/admin/login");
  let initial: WhmPublicConfig = {
      url: "",
      username: "",
      configured: false,
      hasToken: false,
      state: "pending",
    },
    error = "";
  try {
    initial = await whmConfiguration();
  } catch (e) {
    error = safeWhmError(e).message;
  }
  return (
    <>
      <p className="accent">SERVIDOR / ACCESO SEGURO</p>
      <h1>Conexión WHM / cPanel</h1>
      <p className="muted">
        Configura servidor, usuario y API token aquí. Cifrado en el servidor;
        ninguna contraseña ni token guardado se muestra después. Las lecturas y
        gestiones dependen de los permisos WHM; cada cambio de cuenta o paquete
        requiere confirmación.
      </p>
      <div className="glass">
        <SettingsForm initial={initial} storageError={error} />
      </div>
    </>
  );
}
