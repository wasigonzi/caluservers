import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { retryProvisioning } from "@/lib/provisioning";
import { whmGuard, whmJson } from "@/lib/whm-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/admin/orders/[id]/retry — reintenta el aprovisionamiento de
 *  un pedido fallido. Solo desde provision_failed; si ya está activo no
 *  hace nada. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await whmGuard(req, true);
  if (denied) return denied;
  const { id } = await params;
  const existing = await db.order.findUnique({ where: { id } });
  if (!existing) return whmJson({ error: "Pedido no encontrado." }, 404);
  try {
    const result = await retryProvisioning(id);
    return whmJson({
      ok: true,
      number: result.order.number,
      status: result.order.status,
      provisioned: result.ok,
      provisionError: result.error ?? null,
      whmUsername: result.order.whmUsername,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo reintentar.";
    return whmJson(
      { error: message },
      message.includes("Solo se puede reintentar") ? 409 : 400,
    );
  }
}
