import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { whmConfiguration } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import WhmReadPanel from "@/components/admin/WhmReadPanel";
export const dynamic = "force-dynamic";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section } = await params;
  if (
    [
      "clients",
      "orders",
      "invoices",
      "services",
      "products",
      "tickets",
    ].includes(section)
  )
    return (
      <>
        <h1>Sección anterior retirada</h1>
        <p className="muted">
          No se han eliminado clientes, pedidos, facturas ni otros datos
          históricos. La integración activa ahora consulta únicamente cuentas y
          paquetes WHM; no reemplaza facturación ni convierte productos en
          pedidos.
        </p>
        <Link className="btn" href="/admin">
          Ir al dashboard →
        </Link>
      </>
    );
  if (section !== "accounts" && section !== "packages") notFound();
  let configured = false,
    error = "";
  try {
    configured = (await whmConfiguration()).configured;
  } catch (e) {
    error = safeWhmError(e).message;
  }
  return (
    <>
      <p className="accent">WHM / SÓLO LECTURA</p>
      <h1>
        {section === "accounts" ? "Cuentas cPanel" : "Paquetes de hosting"}
      </h1>
      <WhmReadPanel
        mode={section === "accounts" ? "listaccts" : "listpkgs"}
        configured={configured}
        storageError={error}
      />
    </>
  );
}
