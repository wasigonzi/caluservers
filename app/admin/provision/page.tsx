import { redirect } from "next/navigation";
import ProvisionForm from "@/components/admin/ProvisionForm";
import { isAdmin } from "@/lib/auth";
import { getCatalogPayload } from "@/lib/catalog-db";
import { safeWhmError } from "@/lib/whm-security";
import { provisionConfiguration, type ProvisionPublicConfig } from "@/lib/whm-provision";

export const dynamic = "force-dynamic";

const EMPTY: ProvisionPublicConfig = {
  url: "",
  username: "",
  hasToken: false,
  enabled: false,
  packageName: "",
  packageByPlan: {},
  ready: false,
  mailReady: false,
};

export default async function ProvisionAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  let initial = EMPTY;
  let error = "";
  try {
    initial = await provisionConfiguration();
  } catch (e) {
    error = safeWhmError(e).message;
  }
  const catalog = await getCatalogPayload();
  const plans = catalog.webHosting.map((plan) => ({ id: plan.id, name: plan.name }));

  return (
    <>
      <p className="accent">SERVIDOR / ESCRITURA CONTROLADA</p>
      <h1>Alta automática en WHM</h1>
      <p className="muted">
        Crea la cuenta cPanel cuando un pago queda confirmado. Usa credenciales propias,
        separadas del token de solo lectura, y solo se aplica a planes de hosting con un
        dominio declarado en el pedido. Si el alta falla, el pago sigue registrado y el
        servicio queda pendiente para reintentarlo a mano.
      </p>
      <div className="glass">
        <ProvisionForm initial={initial} plans={plans} storageError={error} />
      </div>
    </>
  );
}
