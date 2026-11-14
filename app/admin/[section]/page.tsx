import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { whmConfiguration } from "@/lib/whm";
import { safeWhmError } from "@/lib/whm-security";
import { decryptProvisioningSecret } from "@/lib/provisioning";
import WhmReadPanel from "@/components/admin/WhmReadPanel";
import OrdersPanel, { type AdminOrder } from "@/components/admin/OrdersPanel";
export const dynamic = "force-dynamic";
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section } = await params;
  if (
    ["clients", "invoices", "services", "products", "tickets"].includes(
      section,
    )
  )
    return (
      <>
        <h1>Sección anterior retirada</h1>
        <p className="muted">
          No se han eliminado clientes, facturas ni otros datos históricos. La
          integración activa ahora consulta únicamente cuentas y paquetes WHM;
          no reemplaza facturación ni convierte productos en pedidos.
        </p>
        <Link className="btn" href="/admin">
          Ir al dashboard →
        </Link>
      </>
    );
  if (section === "orders") {
    let configured = false;
    try {
      configured = (await whmConfiguration()).configured;
    } catch {
      configured = false;
    }
    const rows = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { hostingAccount: true },
    });
    const orders: AdminOrder[] = rows.map((o) => {
      let password: string | null = null;
      if (o.hostingAccount) {
        try {
          password = decryptProvisioningSecret(
            o.hostingAccount.encryptedPassword,
          );
        } catch {
          password = null;
        }
      }
      return {
        id: o.id,
        number: o.number,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        domain: o.domain,
        planName: o.planName,
        price: o.price,
        status: o.status,
        paymentRef: o.paymentRef,
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        whmUsername: o.whmUsername,
        whmPackage: o.whmPackage,
        provisionAttempts: o.provisionAttempts,
        provisionError: o.provisionError,
        createdAt: o.createdAt.toISOString(),
        password,
        trackingUrl: `/pedido/${o.lookupToken}`,
      };
    });
    return (
      <>
        <p className="accent">VENTAS / PEDIDOS</p>
        <h1>Pedidos</h1>
        <p className="muted">
          Pedidos desde el checkout de la web. Al confirmar el pago, la cuenta
          de hosting se crea automáticamente en WHM.
        </p>
        <OrdersPanel orders={orders} configured={configured} />
      </>
    );
  }
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
      <p className="accent">WHM / GESTIÓN CONFIRMADA</p>
      <h1>
        {section === "accounts" ? "Cuentas cPanel" : "Paquetes de hosting"}
      </h1>
      <WhmReadPanel
        key={section}
        mode={section === "accounts" ? "listaccts" : "listpkgs"}
        configured={configured}
        storageError={error}
      />
    </>
  );
}
