import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AccessDenied from "@/components/admin/AccessDenied";
import { whmConfiguration } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import { PageHeader } from "@/components/admin/ui";
import WhmReadPanel from "@/components/admin/WhmReadPanel";
export const dynamic = "force-dynamic";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { section } = await params;
  // Rutas del panel anterior: llevan a la sección que hoy hace ese trabajo.
  const moved: Record<string, string> = {
    clients: "/admin/clientes",
    orders: "/admin/facturas",
    invoices: "/admin/facturas",
    services: "/admin/servicios",
    products: "/admin/site",
  };
  if (moved[section]) redirect(moved[section]);
  if (section !== "accounts" && section !== "packages") notFound();
  // Cuentas y paquetes son solo lectura de WHM (Fase 1, tramo D — RBAC).
  if (!session.permissions.includes("whm:read")) {
    return <AccessDenied permission="whm:read" />;
  }
  let configured = false,
    error = "";
  try {
    configured = (await whmConfiguration()).configured;
  } catch (e) {
    error = safeWhmError(e).message;
  }
  return (
    <>
      <PageHeader
        eyebrow="WHM / SÓLO LECTURA"
        title={section === "accounts" ? "Cuentas cPanel" : "Paquetes de hosting"}
      />
      <WhmReadPanel
        mode={section === "accounts" ? "listaccts" : "listpkgs"}
        configured={configured}
        storageError={error}
      />
    </>
  );
}
