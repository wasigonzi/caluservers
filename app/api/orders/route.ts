import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPublicCatalog } from "@/lib/catalog-db";
import {
  createOrderRecord,
  resolveWhmPackage,
} from "@/lib/provisioning";

export const dynamic = "force-dynamic";

const DOMAIN_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function whmPackageMap(): Promise<Record<string, string> | null> {
  try {
    const row = await db.siteSetting.findUnique({
      where: { key: "whm_package_map" },
    });
    const value = row?.value;
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, string>;
    return null;
  } catch {
    return null;
  }
}

/** POST /api/orders — crea un pedido de hosting web (pendiente de pago).
 *  Solo planes de hosting web: VPS/dedicados no se pueden aprovisionar
 *  con WHM createacct y conservan su compra externa. Un doble envío del
 *  mismo cliente+dominio+plan devuelve el pedido pendiente existente. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const data = (body ?? {}) as Record<string, unknown>;
  const planId = typeof data.planId === "string" ? data.planId.trim() : "";
  const domain =
    typeof data.domain === "string" ? data.domain.trim().toLowerCase() : "";
  const customerName =
    typeof data.customerName === "string" ? data.customerName.trim() : "";
  const customerEmail =
    typeof data.customerEmail === "string"
      ? data.customerEmail.trim().toLowerCase()
      : "";
  if (!planId) return json({ error: "Elige un plan." }, 400);
  if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain))
    return json({ error: "Escribe un dominio válido (ej. midominio.com)." }, 400);
  if (customerName.length < 2 || customerName.length > 120)
    return json({ error: "Escribe tu nombre completo." }, 400);
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 160)
    return json({ error: "Escribe un correo válido." }, 400);

  let catalog;
  try {
    catalog = await getPublicCatalog();
  } catch {
    return json({ error: "No se pudo cargar el catálogo." }, 502);
  }
  const plan = catalog.webHosting.find(
    (p) => p.id === planId && p.active && p.category === "web",
  );
  if (!plan)
    return json(
      { error: "Ese plan no está disponible para pedido en línea." },
      400,
    );

  try {
    const order = await createOrderRecord({
      customerName,
      customerEmail,
      domain,
      planId: plan.id,
      planName: plan.name,
      planCategory: "web",
      price: plan.price,
      whmPackage: resolveWhmPackage(plan.id, plan.name, await whmPackageMap()),
    });
    return json(
      {
        ok: true,
        number: order.number,
        lookupToken: order.lookupToken,
        trackingUrl: `/pedido/${order.lookupToken}`,
        status: order.status,
      },
      201,
    );
  } catch {
    return json({ error: "No se pudo crear el pedido." }, 502);
  }
}
